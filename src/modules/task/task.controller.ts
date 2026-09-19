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
import { TaskService } from "./task.service";
import {
    AssignTaskWorkerDto,
    CreateTaskCommentDto,
    CreateTaskDto,
    UpdateTaskDto,
} from "./dto/body.dto";
import { ResponseService } from "@/common/interceptors/response";
import { Roles } from "@/common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { UserPayload } from "@/common/guards/auth.guard";

@ApiTags("Tasks")
@ApiBearerAuth()
@Controller("tasks")
export class TaskController {
    constructor(private taskService: TaskService) {}

    @Post()
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Create task (Rule #8: posts system message to project chat)" })
    async createTask(@Body() payload: CreateTaskDto, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.taskService.createTask(payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.CREATED,
            message: result.message,
            data: result.data,
        });
    }

    @Get()
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "List tasks (pass ?kanban=true for board grouped by status)" })
    async fetchAllTasks(@Req() req: Request) {
        const query = req.query;
        const user = req.user as UserPayload;
        const result = await this.taskService.fetchAllTasks(query, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
            pagination: result.pagination,
        });
    }

    @Get(":id")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "Get single task with assignments and comments" })
    async fetchSingleTask(@Param("id") id: string, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.taskService.fetchSingleTask(id, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Patch(":id")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "Update task status, priority, or progress" })
    async updateTask(
        @Param("id") id: string,
        @Body() payload: UpdateTaskDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.taskService.updateTask(id, payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Delete(":id")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Delete task" })
    async deleteTask(@Param("id") id: string, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.taskService.deleteTask(id, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Post(":id/assign")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Assign worker to task" })
    async assignWorkerToTask(
        @Param("id") id: string,
        @Body() payload: AssignTaskWorkerDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.taskService.assignWorkerToTask(id, payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Delete(":id/assign/:workerId")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER)
    @ApiOperation({ summary: "Remove worker assignment from task" })
    async removeWorkerFromTask(
        @Param("id") id: string,
        @Param("workerId") workerId: string,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.taskService.removeWorkerFromTask(id, workerId, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Post(":id/comments")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "Add comment to task" })
    async createTaskComment(
        @Param("id") id: string,
        @Body() payload: CreateTaskCommentDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.taskService.createTaskComment(id, payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.CREATED,
            message: result.message,
            data: result.data,
        });
    }

    @Get(":id/comments")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "Get all comments for a task" })
    async fetchAllTaskComments(
        @Param("id") id: string,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.taskService.fetchAllTaskComments(id, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }
}
