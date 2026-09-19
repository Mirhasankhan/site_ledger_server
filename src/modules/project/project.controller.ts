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
    Query,
} from "@nestjs/common";
import { ProjectService } from "./project.service";
import { CreateProjectDto, UpdateProjectDto } from "./dto/body.dto";
import { ResponseService } from "@/common/interceptors/response";
import { Roles } from "@/common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { UserPayload } from "@/common/guards/auth.guard";

@ApiTags("Projects")
@ApiBearerAuth()
@Controller("projects")
export class ProjectController {
    constructor(private projectService: ProjectService) {}

    @Post()
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: "Admin creates a new project" })
    async createProject(@Body() payload: CreateProjectDto, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.projectService.createProject(payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.CREATED,
            message: result.message,
            data: result.data,
        });
    }

    @Get()
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "List projects (scoped by role per Rule #1)" })
    async fetchAllProjects(@Req() req: Request) {
        const query = req.query;
        const user = req.user as UserPayload;
        const result = await this.projectService.fetchAllProjects(query, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
            pagination: result.pagination,
        });
    }

    @Get(":id")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "Get single project details (scoped by access)" })
    async fetchSingleProject(@Param("id") id: string, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.projectService.fetchSingleProject(id, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Patch(":id")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Update project (Site Manager can only update their managed project)" })
    async updateProject(
        @Param("id") id: string,
        @Body() payload: UpdateProjectDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.projectService.updateProject(id, payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Delete(":id")
    @Roles(UserRole.ADMIN)
    @ApiOperation({ summary: "Admin deletes a project" })
    async deleteProject(@Param("id") id: string, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.projectService.deleteProject(id, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Get(":id/budget-summary")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "Get project budget summary (budget, spent, remaining)" })
    async fetchBudgetSummary(@Param("id") id: string, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.projectService.fetchBudgetSummary(id, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Get(":id/activity")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "Paginated activity log for a project (scoped per Rule #1)" })
    async fetchProjectActivity(@Param("id") id: string, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.projectService.fetchProjectActivity(id, req.query, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
            pagination: result.pagination,
        });
    }
}
