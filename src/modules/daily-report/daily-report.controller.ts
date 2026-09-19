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
import { DailyReportService } from "./daily-report.service";
import { CreateDailyReportDto, UpdateDailyReportDto } from "./dto/body.dto";
import { ResponseService } from "@/common/interceptors/response";
import { Roles } from "@/common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { UserPayload } from "@/common/guards/auth.guard";

@ApiTags("Daily Reports")
@ApiBearerAuth()
@Controller("daily-reports")
export class DailyReportController {
    constructor(private dailyReportService: DailyReportService) {}

    @Post()
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Submit or update daily report for a project date" })
    async createDailyReport(
        @Body() payload: CreateDailyReportDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.dailyReportService.createDailyReport(payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.CREATED,
            message: result.message,
            data: result.data,
        });
    }

    @Get()
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "List daily reports (scoped per Rule #1)" })
    async fetchAllDailyReports(@Req() req: Request) {
        const query = req.query;
        const user = req.user as UserPayload;
        const result = await this.dailyReportService.fetchAllDailyReports(query, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
            pagination: result.pagination,
        });
    }

    @Get(":id")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "Get single daily report" })
    async fetchSingleDailyReport(@Param("id") id: string, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.dailyReportService.fetchSingleDailyReport(id, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Patch(":id")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Update daily report details" })
    async updateDailyReport(
        @Param("id") id: string,
        @Body() payload: UpdateDailyReportDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.dailyReportService.updateDailyReport(id, payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Delete(":id")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Delete daily report" })
    async deleteDailyReport(@Param("id") id: string, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.dailyReportService.deleteDailyReport(id, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }
}
