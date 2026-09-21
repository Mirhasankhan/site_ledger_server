import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/services/prisma/prisma.service";
import { CreateProjectDto, UpdateProjectDto } from "./dto/body.dto";
import { UserPayload } from "@/common/guards/auth.guard";
import { ApiError } from "@/common/errors/api_error";
import { ExpenseStatus, Prisma, UserRole, UserStatus } from "@prisma/client";
import QueryBuilder from "@/common/utils/queryBuilder";
import { ActivityLoggerService } from "@/core/services/activity/activity_logger.service";
import { FileService } from "@/core/services/files/cloudinary.service";

@Injectable()
export class ProjectService {
    constructor(
        private prisma: PrismaService,
        private activityLogger: ActivityLoggerService,
        private fileService: FileService,
    ) {}

    async createProject(
        payload: CreateProjectDto,
        user: UserPayload,
        file?: Express.Multer.File,
    ) {
        const manager = await this.prisma.user.findUnique({
            where: { id: payload.managerId },
        });

        if (!manager || manager.status !== UserStatus.ACTIVE) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "Assigned Site Manager was not found or is inactive",
            );
        }

        if (manager.role !== UserRole.SITE_MANAGER) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "The assigned manager must have the SITE_MANAGER role",
            );
        }

        const existingProjectName = await this.prisma.project.findUnique({
            where: { projectName: payload.projectName },
        });

        if (existingProjectName) {
            throw new ApiError(
                HttpStatus.CONFLICT,
                "A project with this name already exists",
            );
        }

        if (payload.projectCode) {
            const existingCode = await this.prisma.project.findUnique({
                where: { projectCode: payload.projectCode },
            });
            if (existingCode) {
                throw new ApiError(
                    HttpStatus.CONFLICT,
                    "A project with this project code already exists",
                );
            }
        }

        let projectImageUrl = payload.projectImage;

        if (file) {
            projectImageUrl = await this.fileService.uploadToCloudinary(file);
        } else if (
            payload.projectImage &&
            !payload.projectImage.startsWith("http://") &&
            !payload.projectImage.startsWith("https://")
        ) {
            projectImageUrl = await this.fileService.uploadToCloudinary(
                payload.projectImage,
            );
        }

        if (!projectImageUrl) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "Project image is required",
            );
        }

        const project = await this.prisma.$transaction(async (tx) => {
            const created = await tx.project.create({
                data: {
                    projectName: payload.projectName,
                    projectCode: payload.projectCode ?? null,
                    managerId: payload.managerId,
                    address: payload.address,
                    description: payload.description,
                    projectImage: projectImageUrl,
                    budget: payload.budget ?? 0,
                    status: payload.status,
                    standardWorkHours: payload.standardWorkHours ?? 8,
                    startDate: payload.startDate
                        ? new Date(payload.startDate)
                        : null,
                    endDate: payload.endDate ? new Date(payload.endDate) : null,
                },
            });

            await tx.projectRoom.create({
                data: {
                    projectId: created.id,
                },
            });

            return created;
        });

        await this.activityLogger.log({
            projectId: project.id,
            actorId: user.id,
            action: "PROJECT_CREATED",
            entityType: "Project",
            entityId: project.id,
            metadata: {
                projectName: project.projectName,
                managerId: project.managerId,
                budget: project.budget,
            },
        });

        return {
            message: "Project created successfully",
            data: { id: project.id },
        };
    }

    async fetchAllProjects(query: Record<string, any>, user: UserPayload) {
        const scopedQuery = { ...query };

        if (user.role === UserRole.SITE_MANAGER) {
            scopedQuery.managerId = user.id;
        } else if (user.role === UserRole.WORKER) {
            const workerProfile = await this.prisma.workerProfile.findUnique({
                where: { workerId: user.id },
            });

            if (!workerProfile?.projectId) {
                return {
                    message: "Projects fetched successfully",
                    data: [],
                    pagination: {
                        page: 1,
                        limit: 10,
                        total: 0,
                        totalPage: 0,
                    },
                };
            }

            scopedQuery.id = workerProfile.projectId;
        }

        const queryBuilder = new QueryBuilder<
            typeof this.prisma.project,
            Prisma.$ProjectPayload
        >(this.prisma.project, scopedQuery);

        const response = await queryBuilder
            .search(["projectName", "projectCode", "address"])
            .sort()
            .filter({ exacts: ["status", "managerId", "id"] })
            .paginate()
            .include({
                manager: {
                    select: {
                        id: true,
                        userName: true,
                        email: true,
                    },
                },
                _count: {
                    select: {
                        workerProfiles: true,
                        tasks: true,
                    },
                },
            })
            .execute();

        const pagination = await queryBuilder.countTotal();

        return {
            message: "Projects fetched successfully",
            data: response,
            pagination,
        };
    }

    async fetchAvailableSiteManagers() {
        const siteManagers = await this.prisma.user.findMany({
            where: {
                role: UserRole.SITE_MANAGER,
                status: UserStatus.ACTIVE,
            },
            select: {
                id: true,
                userName: true,
                email: true,
                profileImage: true,
                status: true,
                managedProjects: {
                    select: {
                        id: true,
                        projectName: true,
                        status: true,
                    },
                },
                _count: {
                    select: {
                        managedProjects: true,
                    },
                },
            },
            orderBy: {
                userName: "asc",
            },
        });

        return {
            message: "Site managers fetched successfully",
            data: siteManagers,
        };
    }

    async fetchSingleProject(id: string, user: UserPayload) {
        const project = await this.prisma.project.findUnique({
            where: { id },
            include: {
                manager: {
                    select: {
                        id: true,
                        userName: true,
                        email: true,
                    },
                },
                workerRates: {
                    where: { isActive: true },
                },
                _count: {
                    select: {
                        workerProfiles: true,
                        tasks: true,
                        dailyReports: true,
                        expenses: true,
                    },
                },
            },
        });

        if (!project) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "You do not have access to view this project",
            );
        }

        if (user.role === UserRole.WORKER) {
            const workerProfile = await this.prisma.workerProfile.findUnique({
                where: { workerId: user.id },
            });
            if (workerProfile?.projectId !== project.id) {
                throw new ApiError(
                    HttpStatus.FORBIDDEN,
                    "You do not have access to view this project",
                );
            }
        }

        return {
            message: "Project fetched successfully",
            data: project,
        };
    }

    async updateProject(
        id: string,
        payload: UpdateProjectDto,
        user: UserPayload,
        file?: Express.Multer.File,
    ) {
        const project = await this.prisma.project.findUnique({
            where: { id },
        });

        if (!project) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
        }

        if (user.role === UserRole.SITE_MANAGER) {
            if (project.managerId !== user.id) {
                throw new ApiError(
                    HttpStatus.FORBIDDEN,
                    "You do not have permission to update this project",
                );
            }
            if (payload.managerId && payload.managerId !== user.id) {
                throw new ApiError(
                    HttpStatus.FORBIDDEN,
                    "Site Manager cannot reassign the project manager",
                );
            }
            if (
                payload.budget !== undefined &&
                payload.budget !== project.budget
            ) {
                throw new ApiError(
                    HttpStatus.FORBIDDEN,
                    "Only Admin can modify project budget",
                );
            }
        }

        if (payload.managerId && payload.managerId !== project.managerId) {
            const newManager = await this.prisma.user.findUnique({
                where: { id: payload.managerId },
            });
            if (
                !newManager ||
                newManager.role !== UserRole.SITE_MANAGER ||
                newManager.status !== UserStatus.ACTIVE
            ) {
                throw new ApiError(
                    HttpStatus.BAD_REQUEST,
                    "The specified manager was not found or is not an active Site Manager",
                );
            }
        }

        let projectImageUrl = payload.projectImage;

        if (file) {
            projectImageUrl = await this.fileService.uploadToCloudinary(file);
        } else if (
            payload.projectImage &&
            !payload.projectImage.startsWith("http://") &&
            !payload.projectImage.startsWith("https://")
        ) {
            projectImageUrl = await this.fileService.uploadToCloudinary(
                payload.projectImage,
            );
        }

        const updateData: Prisma.ProjectUpdateInput = {
            ...(payload.projectName && { projectName: payload.projectName }),
            ...(payload.projectCode !== undefined && {
                projectCode: payload.projectCode,
            }),
            ...(payload.address && { address: payload.address }),
            ...(payload.description && { description: payload.description }),
            ...(projectImageUrl && { projectImage: projectImageUrl }),
            ...(payload.budget !== undefined && { budget: payload.budget }),
            ...(payload.status && { status: payload.status }),
            ...(payload.standardWorkHours !== undefined && {
                standardWorkHours: payload.standardWorkHours,
            }),
            ...(payload.startDate !== undefined && {
                startDate: payload.startDate
                    ? new Date(payload.startDate)
                    : null,
            }),
            ...(payload.endDate !== undefined && {
                endDate: payload.endDate ? new Date(payload.endDate) : null,
            }),
            ...(payload.managerId && {
                manager: { connect: { id: payload.managerId } },
            }),
        };

        const updated = await this.prisma.project.update({
            where: { id },
            data: updateData,
        });

        await this.activityLogger.log({
            projectId: id,
            actorId: user.id,
            action: "PROJECT_UPDATED",
            entityType: "Project",
            entityId: id,
            metadata: { updatedFields: Object.keys(payload) },
        });

        return {
            message: "Project updated successfully",
            data: { id: updated.id },
        };
    }

    async deleteProject(id: string, user: UserPayload) {
        const project = await this.prisma.project.findUnique({
            where: { id },
        });

        if (!project) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
        }

        await this.prisma.project.delete({
            where: { id },
        });

        await this.activityLogger.log({
            projectId: id,
            actorId: user.id,
            action: "PROJECT_DELETED",
            entityType: "Project",
            entityId: id,
            metadata: { projectName: project.projectName },
        });

        return {
            message: "Project deleted successfully",
            data: { id },
        };
    }

    async fetchBudgetSummary(id: string, user: UserPayload) {
        const project = await this.prisma.project.findUnique({
            where: { id },
            select: {
                id: true,
                projectName: true,
                budget: true,
                managerId: true,
            },
        });

        if (!project) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Access denied to budget summary for this project",
            );
        }

        if (user.role === UserRole.WORKER) {
            const workerProfile = await this.prisma.workerProfile.findUnique({
                where: { workerId: user.id },
            });
            if (workerProfile?.projectId !== project.id) {
                throw new ApiError(
                    HttpStatus.FORBIDDEN,
                    "Access denied to budget summary for this project",
                );
            }
        }

        // Two-level parallelism per CODEBASE_INSTRUCTIONS.md rule 8
        const getApprovedExpenses = async () => {
            const result = await this.prisma.expense.aggregate({
                _sum: { amount: true },
                where: {
                    projectId: id,
                    status: {
                        in: [ExpenseStatus.Approved, ExpenseStatus.Paid],
                    },
                },
            });
            return result._sum.amount ?? 0;
        };

        const getMaterialUsageCost = async () => {
            const usages = await this.prisma.materialUsage.findMany({
                where: { projectId: id },
                include: { material: { select: { unitCost: true } } },
            });
            return usages.reduce(
                (acc, u) => acc + u.quantityUsed * (u.material?.unitCost ?? 0),
                0,
            );
        };

        const getPaymentsTotal = async () => {
            const result = await this.prisma.payment.aggregate({
                _sum: { amount: true },
                where: { projectId: id },
            });
            return result._sum.amount ?? 0;
        };

        const [expensesSpent, materialUsageSpent, paymentsSpent] =
            await Promise.all([
                getApprovedExpenses(),
                getMaterialUsageCost(),
                getPaymentsTotal(),
            ]);

        const totalSpent = expensesSpent + materialUsageSpent + paymentsSpent;
        const remaining = project.budget - totalSpent;

        return {
            message: "Project budget summary calculated successfully",
            data: {
                projectId: project.id,
                projectName: project.projectName,
                budget: project.budget,
                spent: totalSpent,
                remaining,
                breakdown: {
                    expenses: expensesSpent,
                    materials: materialUsageSpent,
                    payments: paymentsSpent,
                },
            },
        };
    }

    async fetchProjectActivity(
        id: string,
        query: Record<string, any>,
        user: UserPayload,
    ) {
        const project = await this.prisma.project.findUnique({
            where: { id },
            select: { id: true, managerId: true },
        });

        if (!project) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
        }

        // Rule #1 scoping
        if (
            user.role === UserRole.SITE_MANAGER &&
            project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Access denied to this project's activity log",
            );
        }

        if (user.role === UserRole.WORKER) {
            const workerProfile = await this.prisma.workerProfile.findUnique({
                where: { workerId: user.id },
            });
            if (workerProfile?.projectId !== project.id) {
                throw new ApiError(
                    HttpStatus.FORBIDDEN,
                    "Access denied to this project's activity log",
                );
            }
        }

        const page = parseInt(query.page ?? "1", 10);
        const limit = parseInt(query.limit ?? "20", 10);
        const skip = (page - 1) * limit;

        const where: Prisma.ActivityLogWhereInput = {
            projectId: id,
            ...(query.action ? { action: query.action } : {}),
            ...(query.entityType ? { entityType: query.entityType } : {}),
        };

        const [logs, total] = await Promise.all([
            this.prisma.activityLog.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
                include: {
                    actor: {
                        select: {
                            id: true,
                            userName: true,
                            profileImage: true,
                        },
                    },
                },
            }),
            this.prisma.activityLog.count({ where }),
        ]);

        return {
            message: "Activity log fetched successfully",
            data: logs,
            pagination: {
                page,
                limit,
                total,
                totalPage: Math.ceil(total / limit),
            },
        };
    }

    async fetchGlobalActivity(query: Record<string, any>, user: UserPayload) {
        // Admin-only global audit feed
        if (user.role !== UserRole.ADMIN) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Only Admin can access the global activity log",
            );
        }

        const page = parseInt(query.page ?? "1", 10);
        const limit = parseInt(query.limit ?? "20", 10);
        const skip = (page - 1) * limit;

        const where: Prisma.ActivityLogWhereInput = {
            ...(query.action ? { action: query.action } : {}),
            ...(query.entityType ? { entityType: query.entityType } : {}),
            ...(query.projectId ? { projectId: query.projectId } : {}),
        };

        const [logs, total] = await Promise.all([
            this.prisma.activityLog.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
                include: {
                    actor: {
                        select: {
                            id: true,
                            userName: true,
                            profileImage: true,
                        },
                    },
                    project: { select: { id: true, projectName: true } },
                },
            }),
            this.prisma.activityLog.count({ where }),
        ]);

        return {
            message: "Global activity log fetched successfully",
            data: logs,
            pagination: {
                page,
                limit,
                total,
                totalPage: Math.ceil(total / limit),
            },
        };
    }
}
