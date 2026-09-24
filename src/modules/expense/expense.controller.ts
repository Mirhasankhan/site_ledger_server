import {
    Body,
    Controller,
    Delete,
    Get,
    HttpStatus,
    Param,
    Patch,
    Post,
    Req,
} from "@nestjs/common";
import { ExpenseService } from "./expense.service";
import {
    CreateExpenseDto,
    ReviewExpenseDto,
    UpdateExpenseDto,
} from "./dto/body.dto";
import { ResponseService } from "@/common/interceptors/response";
import { Roles } from "@/common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { UserPayload } from "@/common/guards/auth.guard";

@ApiTags("Expenses")
@ApiBearerAuth()
@Controller("expenses")
export class ExpenseController {
    constructor(private expenseService: ExpenseService) {}

    @Post()
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Record new project expense" })
    async createExpense(@Body() payload: CreateExpenseDto, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.expenseService.createExpense(payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.CREATED,
            message: result.message,
            data: result.data,
        });
    }

    @Patch(":id/review")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Review expense (Approve, Reject, or Mark as Paid)" })
    async reviewExpense(
        @Param("id") id: string,
        @Body() payload: ReviewExpenseDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.expenseService.reviewExpense(id, payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Get()
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "List project expenses (scoped per Rule #1)" })
    async fetchAllExpenses(@Req() req: Request) {
        const query = req.query;
        const user = req.user as UserPayload;
        const result = await this.expenseService.fetchAllExpenses(query, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
            pagination: result.pagination,
        });
    }

    @Get(":id")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Get single expense details" })
    async fetchSingleExpense(@Param("id") id: string, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.expenseService.fetchSingleExpense(id, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Patch(":id")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Update expense details" })
    async updateExpense(
        @Param("id") id: string,
        @Body() payload: UpdateExpenseDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.expenseService.updateExpense(id, payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Delete(":id")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Delete expense" })
    async deleteExpense(@Param("id") id: string, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.expenseService.deleteExpense(id, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }
}
