import {
    Body,
    Controller,
    Get,
    HttpStatus,
    Param,
    Post,
    Req,
} from "@nestjs/common";
import { RateService } from "./rate.service";
import { SetProjectWorkerRateDto } from "./dto/body.dto";
import { ResponseService } from "@/common/interceptors/response";
import { Roles } from "@/common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { UserPayload } from "@/common/guards/auth.guard";

@ApiTags("Project Rates")
@ApiBearerAuth()
@Controller("projects/:projectId/rates")
export class RateController {
    constructor(private rateService: RateService) {}

    @Post()
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Configure worker rate for project (Rule #3: rate history pattern)" })
    async createRate(
        @Param("projectId") projectId: string,
        @Body() payload: SetProjectWorkerRateDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.rateService.createRate(projectId, payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.CREATED,
            message: result.message,
            data: result.data,
        });
    }

    @Get()
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "Get worker rates for project" })
    async fetchAllRates(
        @Param("projectId") projectId: string,
        @Req() req: Request,
    ) {
        const query = req.query;
        const user = req.user as UserPayload;
        const result = await this.rateService.fetchAllRates(projectId, query, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }
}
