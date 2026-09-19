import {
    Controller,
    Get,
    HttpStatus,
    Req,
} from "@nestjs/common";
import { ProjectService } from "./project.service";
import { ResponseService } from "@/common/interceptors/response";
import { Roles } from "@/common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { UserPayload } from "@/common/guards/auth.guard";

@ApiTags("Activity Log")
@ApiBearerAuth()
@Controller("activity")
export class ActivityController {
    constructor(private projectService: ProjectService) {}

    @Get()
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: "Admin-only global audit log across all projects, filterable by entityType, action, projectId" })
    async fetchGlobalActivity(@Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.projectService.fetchGlobalActivity(req.query, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
            pagination: result.pagination,
        });
    }
}
