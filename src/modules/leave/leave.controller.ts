import {
    Body,
    Controller,
    Get,
    HttpStatus,
    Param,
    Patch,
    Post,
    Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { UserRole } from "@prisma/client";
import { ResponseService } from "@/common/interceptors/response";
import { Roles } from "@/common/decorators/roles.decorator";
import { UserPayload } from "@/common/guards/auth.guard";
import { CreateLeaveDto, ReviewLeaveDto } from "./dto/body.dto";
import { LeaveService } from "./leave.service";

@ApiTags("Leave Requests")
@ApiBearerAuth()
@Controller("leaves")
export class LeaveController {
    constructor(private leaveService: LeaveService) {}

    @Post()
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "Create a leave request" })
    async createLeave(@Body() payload: CreateLeaveDto, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.leaveService.createLeave(payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.CREATED,
            message: result.message,
            data: result.data,
        });
    }

    @Get()
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "List leave requests scoped by role" })
    async fetchAllLeaves(@Req() req: Request) {
        const query = req.query;
        const user = req.user as UserPayload;
        const result = await this.leaveService.fetchAllLeaves(query, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
            pagination: result.pagination,
        });
    }

    @Get(":id")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "Get one leave request" })
    async fetchSingleLeave(@Param("id") id: string, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.leaveService.fetchSingleLeave(id, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Patch(":id/review")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Approve or reject a leave request" })
    async reviewLeave(
        @Param("id") id: string,
        @Body() payload: ReviewLeaveDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.leaveService.reviewLeave(id, payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }
}
