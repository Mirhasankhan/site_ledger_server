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
import { AttendanceService } from "./attendance.service";
import {
    BulkMarkAttendanceDto,
    MarkAttendanceDto,
    SelfCheckInDto,
    VerifyAttendanceDto,
} from "./dto/body.dto";
import { ResponseService } from "@/common/interceptors/response";
import { Roles } from "@/common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { UserPayload } from "@/common/guards/auth.guard";

@ApiTags("Attendance")
@ApiBearerAuth()
@Controller("attendances")
export class AttendanceController {
    constructor(private attendanceService: AttendanceService) {}

    @Post("mark")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Manager marks single worker attendance (Rule #4: upsert, half-day note validation)" })
    async markAttendance(
        @Body() payload: MarkAttendanceDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.attendanceService.markAttendance(payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Post("bulk")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Manager bulk-marks attendance for project date" })
    async bulkMarkAttendance(
        @Body() payload: BulkMarkAttendanceDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.attendanceService.bulkMarkAttendance(payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Post("self-checkin")
    @Roles(UserRole.WORKER)
    @ApiOperation({ summary: "Worker self-check-in / check-out (Pending Verification)" })
    async selfCheckIn(
        @Body() payload: SelfCheckInDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.attendanceService.selfCheckIn(payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Patch(":id/verify")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Manager verifies attendance and overwrites self-submitted data" })
    async verifyAttendance(
        @Param("id") id: string,
        @Body() payload: VerifyAttendanceDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.attendanceService.verifyAttendance(id, payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Get()
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "List attendance records (scoped per Rule #1)" })
    async fetchAllAttendance(@Req() req: Request) {
        const query = req.query;
        const user = req.user as UserPayload;
        const result = await this.attendanceService.fetchAllAttendance(query, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
            pagination: result.pagination,
        });
    }

    @Get(":id")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "Get single attendance record" })
    async fetchSingleAttendance(@Param("id") id: string, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.attendanceService.fetchSingleAttendance(id, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }
}
