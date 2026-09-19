import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/services/prisma/prisma.service";
import {
    CreateExpenseDto,
    ReviewExpenseDto,
    UpdateExpenseDto,
} from "./dto/body.dto";
import { UserPayload } from "@/common/guards/auth.guard";
import { ApiError } from "@/common/errors/api_error";
import { ExpenseStatus, Prisma, UserRole } from "@prisma/client";
import QueryBuilder from "@/common/utils/queryBuilder";
import { ActivityLoggerService } from "@/core/services/activity/activity_logger.service";

@Injectable()
export class ExpenseService {
    constructor(
        private prisma: PrismaService,
        private activityLogger: ActivityLoggerService,
    ) {}

    async createExpense(payload: CreateExpenseDto, user: UserPayload) {
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
                "You can only record expenses for projects you manage",
            );
        }

        const expense = await this.prisma.expense.create({
            data: {
                projectId: project.id,
                title: payload.title,
                category: payload.category,
                amount: payload.amount,
                date: payload.date ? new Date(payload.date) : new Date(),
                vendor: payload.vendor ?? null,
                reference: payload.reference ?? null,
                receiptUrl: payload.receiptUrl ?? null,
                notes: payload.notes ?? null,
                status: ExpenseStatus.Pending,
                recordedById: user.id,
            },
        });

        // Rule #7: ActivityLog
        await this.activityLogger.log({
            projectId: project.id,
            actorId: user.id,
            action: "EXPENSE_RECORDED",
            entityType: "Expense",
            entityId: expense.id,
            metadata: {
                title: expense.title,
                category: expense.category,
                amount: expense.amount,
            },
        });

        return {
            message: "Expense recorded successfully",
            data: { id: expense.id },
        };
    }

    async reviewExpense(
        id: string,
        payload: ReviewExpenseDto,
        user: UserPayload,
    ) {
        const expense = await this.prisma.expense.findUnique({
            where: { id },
            include: { project: true },
        });

        if (!expense) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Expense not found");
        }

        // Rule #1 scoping check
        if (
            user.role === UserRole.SITE_MANAGER &&
            expense.project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "You can only review expenses for projects you manage",
            );
        }

        const updated = await this.prisma.expense.update({
            where: { id },
            data: {
                status: payload.status,
                reviewedById: user.id,
                ...(payload.notes ? { notes: payload.notes } : {}),
            },
        });

        // Rule #7: ActivityLog
        await this.activityLogger.log({
            projectId: expense.projectId,
            actorId: user.id,
            action: "EXPENSE_REVIEWED",
            entityType: "Expense",
            entityId: id,
            metadata: {
                status: payload.status,
                amount: expense.amount,
                category: expense.category,
            },
        });

        return {
            message: `Expense ${payload.status.toLowerCase()} successfully`,
            data: { id: updated.id, status: updated.status },
        };
    }

    async fetchAllExpenses(query: Record<string, any>, user: UserPayload) {
        const scopedQuery = { ...query };
        let projectScope: Prisma.ExpenseWhereInput | undefined;

        // Rule #1 scoping check
        if (user.role === UserRole.SITE_MANAGER) {
            const managedProjects = await this.prisma.project.findMany({
                where: { managerId: user.id },
                select: { id: true },
            });
            const managedIds = managedProjects.map((p) => p.id);

            if (
                scopedQuery.projectId &&
                !managedIds.includes(scopedQuery.projectId)
            ) {
                throw new ApiError(
                    HttpStatus.FORBIDDEN,
                    "Access denied to expenses for this project",
                );
            }

            if (!scopedQuery.projectId) {
                projectScope = { projectId: { in: managedIds } };
            }
        } else if (user.role === UserRole.WORKER) {
            const workerProfile = await this.prisma.workerProfile.findUnique({
                where: { workerId: user.id },
            });
            if (!workerProfile?.projectId) {
                return {
                    message: "Expenses fetched successfully",
                    data: [],
                    pagination: { page: 1, limit: 10, total: 0, totalPage: 0 },
                };
            }
            scopedQuery.projectId = workerProfile.projectId;
        }

        const queryBuilder = new QueryBuilder<
            typeof this.prisma.expense,
            Prisma.$ExpensePayload
        >(this.prisma.expense, scopedQuery);

        const response = await queryBuilder
            .rawFilter(projectScope ?? {})
            .search(["title", "vendor", "reference"])
            .sort()
            .filter({ exacts: ["projectId", "category", "status"] })
            .paginate()
            .include({
                recordedBy: {
                    select: {
                        id: true,
                        userName: true,
                        email: true,
                    },
                },
                reviewedBy: {
                    select: {
                        id: true,
                        userName: true,
                    },
                },
                project: {
                    select: {
                        id: true,
                        projectName: true,
                        projectCode: true,
                    },
                },
            })
            .execute();

        const pagination = await queryBuilder.countTotal();

        return {
            message: "Expenses fetched successfully",
            data: response,
            pagination,
        };
    }

    async fetchSingleExpense(id: string, user: UserPayload) {
        const expense = await this.prisma.expense.findUnique({
            where: { id },
            include: {
                project: true,
                recordedBy: {
                    select: {
                        id: true,
                        userName: true,
                        email: true,
                    },
                },
                reviewedBy: {
                    select: {
                        id: true,
                        userName: true,
                    },
                },
            },
        });

        if (!expense) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Expense not found");
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            expense.project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Access denied to view this expense",
            );
        }

        if (user.role === UserRole.WORKER) {
            const workerProfile = await this.prisma.workerProfile.findUnique({
                where: { workerId: user.id },
            });
            if (workerProfile?.projectId !== expense.projectId) {
                throw new ApiError(
                    HttpStatus.FORBIDDEN,
                    "Access denied to view this expense",
                );
            }
        }

        return {
            message: "Expense fetched successfully",
            data: expense,
        };
    }

    async updateExpense(
        id: string,
        payload: UpdateExpenseDto,
        user: UserPayload,
    ) {
        const expense = await this.prisma.expense.findUnique({
            where: { id },
            include: { project: true },
        });

        if (!expense) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Expense not found");
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            expense.project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "You can only update expenses for projects you manage",
            );
        }

        if (
            expense.status !== ExpenseStatus.Pending &&
            user.role !== UserRole.ADMIN
        ) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "Cannot modify an expense that has already been reviewed or paid",
            );
        }

        const updateData: Prisma.ExpenseUpdateInput = {
            ...(payload.title && { title: payload.title }),
            ...(payload.category && { category: payload.category }),
            ...(payload.amount !== undefined && { amount: payload.amount }),
            ...(payload.date !== undefined && {
                date: payload.date ? new Date(payload.date) : new Date(),
            }),
            ...(payload.vendor !== undefined && { vendor: payload.vendor }),
            ...(payload.reference !== undefined && {
                reference: payload.reference,
            }),
            ...(payload.receiptUrl !== undefined && {
                receiptUrl: payload.receiptUrl,
            }),
            ...(payload.notes !== undefined && { notes: payload.notes }),
        };

        const updated = await this.prisma.expense.update({
            where: { id },
            data: updateData,
        });

        await this.activityLogger.log({
            projectId: expense.projectId,
            actorId: user.id,
            action: "EXPENSE_UPDATED",
            entityType: "Expense",
            entityId: id,
            metadata: { updatedFields: Object.keys(payload) },
        });

        return {
            message: "Expense updated successfully",
            data: { id: updated.id },
        };
    }

    async deleteExpense(id: string, user: UserPayload) {
        const expense = await this.prisma.expense.findUnique({
            where: { id },
            include: { project: true },
        });

        if (!expense) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Expense not found");
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            expense.project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "You can only delete expenses for projects you manage",
            );
        }

        await this.prisma.expense.delete({
            where: { id },
        });

        await this.activityLogger.log({
            projectId: expense.projectId,
            actorId: user.id,
            action: "EXPENSE_DELETED",
            entityType: "Expense",
            entityId: id,
            metadata: { title: expense.title, amount: expense.amount },
        });

        return {
            message: "Expense deleted successfully",
            data: { id },
        };
    }
}
