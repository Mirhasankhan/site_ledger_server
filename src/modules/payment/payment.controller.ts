import {
    Body,
    Controller,
    Delete,
    Get,
    HttpStatus,
    Param,
    Post,
    Req,
} from "@nestjs/common";
import { PaymentService } from "./payment.service";
import { CreatePaymentDto } from "./dto/body.dto";
import { ResponseService } from "@/common/interceptors/response";
import { Roles } from "@/common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { UserPayload } from "@/common/guards/auth.guard";

@ApiTags("Payments")
@ApiBearerAuth()
@Controller("payments")
export class PaymentController {
    constructor(private paymentService: PaymentService) {}

    @Post()
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Record a worker payment (Rule #5: decrements outstandingAmount in transaction)" })
    async createPayment(@Body() payload: CreatePaymentDto, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.paymentService.createPayment(payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.CREATED,
            message: result.message,
            data: result.data,
        });
    }

    @Get()
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "List payments (scoped per Rule #1)" })
    async fetchAllPayments(@Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.paymentService.fetchAllPayments(req.query, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
            pagination: result.pagination,
        });
    }

    @Get(":id")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "Fetch single payment (scoped per Rule #1)" })
    async fetchSinglePayment(@Param("id") id: string, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.paymentService.fetchSinglePayment(id, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Delete(":id")
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: "Reverse/delete a payment (Admin only — re-increments outstandingAmount)" })
    async deletePayment(@Param("id") id: string, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.paymentService.deletePayment(id, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }
}
