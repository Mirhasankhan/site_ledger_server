import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/services/prisma/prisma.service";
import {
    AssignTaskWorkerDto,
    CreateTaskCommentDto,
    CreateTaskDto,
    UpdateTaskDto,
} from "./dto/body.dto";
import { UserPayload } from "@/common/guards/auth.guard";
import { ApiError } from "@/common/errors/api_error";
import { Prisma, TaskStatus, UserRole } from "@prisma/client";
import QueryBuilder from "@/common/utils/queryBuilder";
import { ActivityLoggerService } from "@/core/services/activity/activity_logger.service";

@Injectable()
export class TaskService {
    constructor(
        private prisma: PrismaService,
        private activityLogger: ActivityLoggerService,
    ) {}

    async createTask(payload: CreateTaskDto, user: UserPayload) {
        const project = await this.prisma.project.findUnique({
            where: { id: payload.projectId },
        });

        if (!project) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
        }

        // Rule #1 scoping check
        if (
            user.role === UserRole.SITE_MANAGER &&
            project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "You can only create tasks for projects you manage",
            );
        }

        const task = await this.prisma.$transaction(async (tx) => {
            const created = await tx.task.create({
                data: {
                    projectId: project.id,
                    title: payload.title,
                    description: payload.description ?? null,
                    priority: payload.priority,
                    status: payload.status,
                    progress: payload.progress ?? 0,
                    startDate: payload.startDate
                        ? new Date(payload.startDate)
                        : null,
                    dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
                    createdById: user.id,
                },
            });

            if (
                payload.assignedWorkerIds &&
                payload.assignedWorkerIds.length > 0
            ) {
                for (const workerIdentifier of payload.assignedWorkerIds) {
                    const workerProfile = await tx.workerProfile.findFirst({
                        where: {
                            OR: [
                                { id: workerIdentifier },
                                { workerId: workerIdentifier },
                            ],
                        },
                    });

                    if (
                        !workerProfile ||
                        workerProfile.projectId !== project.id
                    ) {
                        throw new ApiError(
                            HttpStatus.BAD_REQUEST,
                            "Every assigned worker must be assigned to the task project",
                        );
                    }

                    await tx.taskAssignment.upsert({
                        where: {
                            taskId_workerId: {
                                taskId: created.id,
                                workerId: workerProfile.id,
                            },
                        },
                        create: {
                            taskId: created.id,
                            workerId: workerProfile.id,
                            assignedById: user.id,
                        },
                        update: {},
                    });
                }
            }

            return created;
        });

        // Rule #8: System message in ProjectMessage when task is created
        const systemMessage = `Task "${task.title}" was created.`;
        await this.activityLogger.log({
            projectId: project.id,
            actorId: user.id,
            action: "TASK_CREATED",
            entityType: "Task",
            entityId: task.id,
            metadata: {
                title: task.title,
                priority: task.priority,
                status: task.status,
            },
            systemMessage,
        });

        return {
            message: "Task created successfully",
            data: { id: task.id },
        };
    }

    async fetchAllTasks(query: Record<string, any>, user: UserPayload) {
        const scopedQuery = { ...query };
        let projectScope: Prisma.TaskWhereInput | undefined;

        // Rule #1 scoping check
        if (user.role === UserRole.WORKER) {
            const workerProfile = await this.prisma.workerProfile.findUnique({
                where: { workerId: user.id },
            });
            if (!workerProfile?.projectId) {
                return {
                    message: "Tasks fetched successfully",
                    data: [],
                    pagination: { page: 1, limit: 10, total: 0, totalPage: 0 },
                };
            }
            scopedQuery.projectId = workerProfile.projectId;
        } else if (user.role === UserRole.SITE_MANAGER) {
            const managedProjects = await this.prisma.project.findMany({
                where: { managerId: user.id },
                select: { id: true },
            });
            const managedProjectIds = managedProjects.map((p) => p.id);

            if (
                scopedQuery.projectId &&
                !managedProjectIds.includes(scopedQuery.projectId)
            ) {
                throw new ApiError(
                    HttpStatus.FORBIDDEN,
                    "You do not have access to tasks for this project",
                );
            }

            if (!scopedQuery.projectId) {
                // Return tasks only for projects managed by this Site Manager
                projectScope = { projectId: { in: managedProjectIds } };
            }
        }

        const isKanban = query.kanban === "true" || query.kanban === true;

        if (isKanban) {
            const tasks = await this.prisma.task.findMany({
                where: {
                    ...(projectScope ?? {}),
                    ...(scopedQuery.projectId
                        ? typeof scopedQuery.projectId === "string"
                            ? { projectId: scopedQuery.projectId }
                            : { projectId: scopedQuery.projectId }
                        : {}),
                    ...(scopedQuery.priority
                        ? { priority: scopedQuery.priority }
                        : {}),
                },
                include: {
                    assignments: {
                        include: {
                            worker: {
                                select: {
                                    id: true,
                                    workerCategory: true,
                                    worker: {
                                        select: {
                                            id: true,
                                            userName: true,
                                            profileImage: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                    _count: {
                        select: {
                            comments: true,
                        },
                    },
                },
                orderBy: { updatedAt: "desc" },
            });

            // Group into Kanban columns
            const kanbanBoard: Record<TaskStatus, typeof tasks> = {
                [TaskStatus.To_Do]: [],
                [TaskStatus.In_Progress]: [],
                [TaskStatus.Blocked]: [],
                [TaskStatus.Completed]: [],
                [TaskStatus.Cancelled]: [],
            };

            for (const task of tasks) {
                if (kanbanBoard[task.status]) {
                    kanbanBoard[task.status].push(task);
                }
            }

            return {
                message: "Kanban tasks fetched successfully",
                data: kanbanBoard,
            };
        }

        const queryBuilder = new QueryBuilder<
            typeof this.prisma.task,
            Prisma.$TaskPayload
        >(this.prisma.task, scopedQuery);

        const response = await queryBuilder
            .rawFilter(projectScope ?? {})
            .search(["title", "description"])
            .sort()
            .filter({ exacts: ["projectId", "status", "priority"] })
            .paginate()
            .include({
                assignments: {
                    include: {
                        worker: {
                            select: {
                                id: true,
                                workerCategory: true,
                                worker: {
                                    select: {
                                        id: true,
                                        userName: true,
                                        profileImage: true,
                                    },
                                },
                            },
                        },
                    },
                },
                _count: {
                    select: {
                        comments: true,
                    },
                },
            })
            .execute();

        const pagination = await queryBuilder.countTotal();

        return {
            message: "Tasks fetched successfully",
            data: response,
            pagination,
        };
    }

    async fetchSingleTask(id: string, user: UserPayload) {
        const task = await this.prisma.task.findUnique({
            where: { id },
            include: {
                project: true,
                createdBy: {
                    select: {
                        id: true,
                        userName: true,
                        email: true,
                    },
                },
                assignments: {
                    include: {
                        worker: {
                            select: {
                                id: true,
                                workerCategory: true,
                                worker: {
                                    select: {
                                        id: true,
                                        userName: true,
                                        email: true,
                                        profileImage: true,
                                    },
                                },
                            },
                        },
                    },
                },
                comments: {
                    orderBy: { createdAt: "desc" },
                },
            },
        });

        if (!task) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            task.project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "You do not have access to view this task",
            );
        }

        if (user.role === UserRole.WORKER) {
            const workerProfile = await this.prisma.workerProfile.findUnique({
                where: { workerId: user.id },
            });
            if (workerProfile?.projectId !== task.projectId) {
                throw new ApiError(
                    HttpStatus.FORBIDDEN,
                    "You do not have access to view this task",
                );
            }
        }

        return {
            message: "Task fetched successfully",
            data: task,
        };
    }

    async updateTask(id: string, payload: UpdateTaskDto, user: UserPayload) {
        const task = await this.prisma.task.findUnique({
            where: { id },
            include: {
                project: true,
                assignments: {
                    include: { worker: true },
                },
            },
        });

        if (!task) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            task.project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "You do not have permission to update this task",
            );
        }

        if (user.role === UserRole.WORKER) {
            const isAssigned = task.assignments.some(
                (a) => a.worker.workerId === user.id,
            );
            if (!isAssigned) {
                throw new ApiError(
                    HttpStatus.FORBIDDEN,
                    "Workers can only update tasks assigned to them",
                );
            }

            // Workers can only update status and progress
            if (
                payload.title ||
                payload.description ||
                payload.startDate ||
                payload.dueDate ||
                payload.priority
            ) {
                throw new ApiError(
                    HttpStatus.FORBIDDEN,
                    "Workers can only update status and progress",
                );
            }
        }

        const updateData: Prisma.TaskUpdateInput = {
            ...(payload.title && { title: payload.title }),
            ...(payload.description !== undefined && {
                description: payload.description,
            }),
            ...(payload.priority && { priority: payload.priority }),
            ...(payload.status && { status: payload.status }),
            ...(payload.progress !== undefined && {
                progress: payload.progress,
            }),
            ...(payload.startDate !== undefined && {
                startDate: payload.startDate
                    ? new Date(payload.startDate)
                    : null,
            }),
            ...(payload.dueDate !== undefined && {
                dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
            }),
        };

        const updated = await this.prisma.task.update({
            where: { id },
            data: updateData,
        });

        await this.activityLogger.log({
            projectId: task.projectId,
            actorId: user.id,
            action: "TASK_UPDATED",
            entityType: "Task",
            entityId: id,
            metadata: {
                title: updated.title,
                status: updated.status,
                progress: updated.progress,
            },
        });

        return {
            message: "Task updated successfully",
            data: { id: updated.id },
        };
    }

    async assignWorkerToTask(
        taskId: string,
        payload: AssignTaskWorkerDto,
        user: UserPayload,
    ) {
        const task = await this.prisma.task.findUnique({
            where: { id: taskId },
            include: { project: true },
        });

        if (!task) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            task.project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "You can only assign workers to tasks in projects you manage",
            );
        }

        const workerProfile = await this.prisma.workerProfile.findFirst({
            where: {
                OR: [{ id: payload.workerId }, { workerId: payload.workerId }],
            },
            include: { worker: true },
        });

        if (!workerProfile) {
            throw new ApiError(
                HttpStatus.NOT_FOUND,
                "Worker profile not found",
            );
        }
        if (workerProfile.projectId !== task.projectId) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "Worker must be assigned to the task project",
            );
        }

        const assignment = await this.prisma.taskAssignment.upsert({
            where: {
                taskId_workerId: {
                    taskId: task.id,
                    workerId: workerProfile.id,
                },
            },
            create: {
                taskId: task.id,
                workerId: workerProfile.id,
                assignedById: user.id,
            },
            update: {},
        });

        await this.activityLogger.log({
            projectId: task.projectId,
            actorId: user.id,
            action: "TASK_WORKER_ASSIGNED",
            entityType: "TaskAssignment",
            entityId: assignment.id,
            metadata: {
                taskId: task.id,
                taskTitle: task.title,
                workerName: workerProfile.worker.userName,
            },
        });

        return {
            message: "Worker assigned to task successfully",
            data: { id: assignment.id },
        };
    }

    async removeWorkerFromTask(
        taskId: string,
        workerIdentifier: string,
        user: UserPayload,
    ) {
        const task = await this.prisma.task.findUnique({
            where: { id: taskId },
            include: { project: true },
        });

        if (!task) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            task.project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "You can only manage tasks in projects you manage",
            );
        }

        const workerProfile = await this.prisma.workerProfile.findFirst({
            where: {
                OR: [{ id: workerIdentifier }, { workerId: workerIdentifier }],
            },
        });

        if (!workerProfile) {
            throw new ApiError(
                HttpStatus.NOT_FOUND,
                "Worker profile not found",
            );
        }
        if (workerProfile.projectId !== task.projectId) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "Worker must be assigned to the task project",
            );
        }

        await this.prisma.taskAssignment.deleteMany({
            where: {
                taskId: task.id,
                workerId: workerProfile.id,
            },
        });

        await this.activityLogger.log({
            projectId: task.projectId,
            actorId: user.id,
            action: "TASK_WORKER_REMOVED",
            entityType: "TaskAssignment",
            entityId: taskId,
            metadata: {
                taskId: task.id,
                workerId: workerProfile.id,
            },
        });

        return {
            message: "Worker removed from task successfully",
            data: { id: taskId },
        };
    }

    async createTaskComment(
        taskId: string,
        payload: CreateTaskCommentDto,
        user: UserPayload,
    ) {
        const task = await this.prisma.task.findUnique({
            where: { id: taskId },
            include: { project: true },
        });

        if (!task) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            task.project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Access denied to task in this project",
            );
        }

        if (user.role === UserRole.WORKER) {
            const workerProfile = await this.prisma.workerProfile.findUnique({
                where: { workerId: user.id },
            });
            if (workerProfile?.projectId !== task.projectId) {
                throw new ApiError(
                    HttpStatus.FORBIDDEN,
                    "Workers can only comment on tasks in their project",
                );
            }
        }

        const comment = await this.prisma.taskComment.create({
            data: {
                taskId: task.id,
                authorId: user.id,
                content: payload.content,
            },
        });

        await this.activityLogger.log({
            projectId: task.projectId,
            actorId: user.id,
            action: "TASK_COMMENT_CREATED",
            entityType: "TaskComment",
            entityId: comment.id,
            metadata: { taskId: task.id },
        });

        return {
            message: "Comment added successfully",
            data: { id: comment.id },
        };
    }

    async fetchAllTaskComments(taskId: string, user: UserPayload) {
        const task = await this.prisma.task.findUnique({
            where: { id: taskId },
            include: { project: true },
        });

        if (!task) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            task.project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Access denied to task in this project",
            );
        }
        if (user.role === UserRole.WORKER) {
            const workerProfile = await this.prisma.workerProfile.findUnique({
                where: { workerId: user.id },
            });
            if (workerProfile?.projectId !== task.projectId) {
                throw new ApiError(
                    HttpStatus.FORBIDDEN,
                    "Workers can only view comments in their project",
                );
            }
        }

        const comments = await this.prisma.taskComment.findMany({
            where: { taskId },
            orderBy: { createdAt: "desc" },
        });

        const authorIds = comments.map((c) => c.authorId);
        const users = await this.prisma.user.findMany({
            where: { id: { in: authorIds } },
            select: {
                id: true,
                userName: true,
                profileImage: true,
                role: true,
            },
        });

        const userMap = new Map(users.map((u) => [u.id, u]));

        const enrichedComments = comments.map((c) => ({
            ...c,
            author: userMap.get(c.authorId) ?? null,
        }));

        return {
            message: "Comments fetched successfully",
            data: enrichedComments,
        };
    }

    async deleteTask(id: string, user: UserPayload) {
        const task = await this.prisma.task.findUnique({
            where: { id },
            include: { project: true },
        });

        if (!task) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Task not found");
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            task.project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "You can only delete tasks for projects you manage",
            );
        }

        await this.prisma.task.delete({
            where: { id },
        });

        await this.activityLogger.log({
            projectId: task.projectId,
            actorId: user.id,
            action: "TASK_DELETED",
            entityType: "Task",
            entityId: id,
            metadata: { title: task.title },
        });

        return {
            message: "Task deleted successfully",
            data: { id },
        };
    }
}
