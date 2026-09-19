import {
    Body,
    Controller,
    Get,
    HttpStatus,
    Param,
    Patch,
    Post,
    Query,
    Req,
} from "@nestjs/common";
import { WorkerService } from "./worker.service";
import { WorkerAssignmentService } from "./worker-assignment.service";
import {
    AssignWorkerDto,
    CreateWithdrawDto,
    ReviewWithdrawDto,
    UpdateWorkerDto,
} from "./dto/body.dto";
import { ResponseService } from "@/common/interceptors/response";
import { Roles } from "@/common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";
import {
    ApiBearerAuth,
    ApiOperation,
    ApiQuery,
    ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { UserPayload } from "@/common/guards/auth.guard";

@ApiTags("Workers")
@ApiBearerAuth()
@Controller("workers")
export class WorkerController {
    constructor(
        private workerService: WorkerService,
        private workerAssignmentService: WorkerAssignmentService,
    ) {}

    @Get()
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "List workers (scoped per Rule #1)" })
    async fetchAllWorkers(@Req() req: Request) {
        const query = req.query;
        const user = req.user as UserPayload;
        const result = await this.workerService.fetchAllWorkers(query, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
            pagination: result.pagination,
        });
    }

    @Get(":id")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "Fetch worker profile (scoped per Rule #1)" })
    async fetchSingleWorker(@Param("id") id: string, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.workerService.fetchSingleWorker(id, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Patch(":id")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "Update worker profile" })
    async updateWorker(
        @Param("id") id: string,
        @Body() payload: UpdateWorkerDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.workerService.updateWorker(id, payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Post(":id/assign")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({
        summary: "Assign worker to project (enforcing Rule #2 and Rule #3)",
    })
    async assignWorker(
        @Param("id") id: string,
        @Body() payload: AssignWorkerDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.workerAssignmentService.assignWorker(
            id,
            payload,
            user,
        );

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Post(":id/unassign")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Remove worker from project (enforcing Rule #2)" })
    async unassignWorker(@Param("id") id: string, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.workerAssignmentService.unassignWorker(
            id,
            user,
        );

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    // ── Withdraw Routes ────────────────────────────────────────────────────

    @Post(":id/withdraws")
    @Roles(UserRole.WORKER)
    @ApiOperation({ summary: "Worker submits a withdrawal request" })
    async createWithdraw(
        @Param("id") id: string,
        @Body() payload: CreateWithdrawDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.workerService.createWithdraw(
            id,
            payload,
            user,
        );

        return ResponseService.formatResponse({
            statusCode: HttpStatus.CREATED,
            message: result.message,
            data: result.data,
        });
    }

    @Get(":id/withdraws")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({
        summary: "List withdrawal requests for a worker (scoped per Rule #1)",
    })
    async getWithdraws(@Param("id") id: string, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.workerService.getWithdraws(
            id,
            req.query,
            user,
        );

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
            pagination: result.pagination,
        });
    }

    @Patch(":id/withdraws/:withdrawId/review")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({
        summary:
            "Admin/Manager reviews a withdrawal request (Accepted decrements currentEarnings)",
    })
    async reviewWithdraw(
        @Param("id") id: string,
        @Param("withdrawId") withdrawId: string,
        @Body() payload: ReviewWithdrawDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.workerService.reviewWithdraw(
            id,
            withdrawId,
            payload,
            user,
        );

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    // ── Earnings Route ─────────────────────────────────────────────────────

    @Get(":id/earnings")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({
        summary: "Compute live earnings for a worker from attendance records",
    })
    @ApiQuery({
        name: "from",
        required: false,
        description: "ISO date string (e.g. 2026-09-01)",
    })
    @ApiQuery({
        name: "to",
        required: false,
        description: "ISO date string (e.g. 2026-09-30)",
    })
    async getWorkerEarnings(
        @Param("id") id: string,
        @Query("from") from?: string,
        @Query("to") to?: string,
        @Req() req?: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.workerService.getWorkerEarnings(
            id,
            { from, to },
            user,
        );

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }
}
