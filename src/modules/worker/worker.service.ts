import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/services/prisma/prisma.service";
import {
    CreateWithdrawDto,
    ReviewWithdrawDto,
    UpdateWorkerDto,
} from "./dto/body.dto";
import { UserPayload } from "@/common/guards/auth.guard";
import { ApiError } from "@/common/errors/api_error";
import {
    AttendanceStatus,
    Prisma,
    TApplyStatus,
    UserRole,
} from "@prisma/client";
import QueryBuilder from "@/common/utils/queryBuilder";
import { ActivityLoggerService } from "@/core/services/activity/activity_logger.service";

@Injectable()
export class WorkerService {
    constructor(
        private prisma: PrismaService,
        private activityLogger: ActivityLoggerService,
    ) {}

    async fetchAllWorkers(query: Record<string, any>, user: UserPayload) {
        const scopedQuery = { ...query };

        // Rule #1: Scoping check
        if (user.role === UserRole.WORKER) {
            scopedQuery.workerId = user.id;
        }

        const queryBuilder = new QueryBuilder<
            typeof this.prisma.workerProfile,
            Prisma.$WorkerProfilePayload
        >(this.prisma.workerProfile, scopedQuery);

        const response = await queryBuilder
            .search(["phoneNumber", "presentAddress", "permanentAddress"])
            .sort()
            .filter({ exacts: ["projectId", "workerCategory", "workerId"] })
            .paginate()
            .include({
                worker: {
                    select: {
                        id: true,
                        userName: true,
                        email: true,
                        profileImage: true,
                        status: true,
                    },
                },
                project: {
                    select: {
                        id: true,
                        projectName: true,
                        projectCode: true,
                        managerId: true,
                    },
                },
            })
            .execute();

        let filteredResponse = response;
        if (user.role === UserRole.SITE_MANAGER) {
            // Site Manager can only view workers in their projects or unassigned workers
            filteredResponse = (response as any[]).filter(
                (w) => !w.projectId || w.project?.managerId === user.id,
            );
        }

        const pagination = await queryBuilder.countTotal();

        return {
            message: "Workers fetched successfully",
            data: filteredResponse,
            pagination,
        };
    }

    async fetchSingleWorker(workerIdentifier: string, user: UserPayload) {
        const worker = await this.prisma.workerProfile.findFirst({
            where: {
                OR: [{ id: workerIdentifier }, { workerId: workerIdentifier }],
            },
            include: {
                worker: {
                    select: {
                        id: true,
                        userName: true,
                        email: true,
                        profileImage: true,
                        status: true,
                    },
                },
                project: {
                    select: {
                        id: true,
                        projectName: true,
                        projectCode: true,
                        managerId: true,
                    },
                },
            },
        });

        if (!worker) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Worker not found");
        }

        // Rule #1 scoping check
        if (user.role === UserRole.WORKER && worker.workerId !== user.id) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Workers can only view their own profile",
            );
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            worker.projectId &&
            worker.project?.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "You do not have access to view this worker",
            );
        }

        return {
            message: "Worker fetched successfully",
            data: worker,
        };
    }

    async updateWorker(
        workerIdentifier: string,
        payload: UpdateWorkerDto,
        user: UserPayload,
    ) {
        const worker = await this.prisma.workerProfile.findFirst({
            where: {
                OR: [{ id: workerIdentifier }, { workerId: workerIdentifier }],
            },
            include: {
                project: true,
            },
        });

        if (!worker) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Worker not found");
        }

        // Rule #1 scoping check
        if (user.role === UserRole.WORKER && worker.workerId !== user.id) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Workers can only update their own profile",
            );
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            worker.projectId &&
            worker.project?.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "You do not have permission to update this worker",
            );
        }

        const updateData: Prisma.WorkerProfileUpdateInput = {
            ...(payload.workerCategory && {
                workerCategory: payload.workerCategory,
            }),
            ...(payload.phoneNumber !== undefined && {
                phoneNumber: payload.phoneNumber,
            }),
            ...(payload.presentAddress !== undefined && {
                presentAddress: payload.presentAddress,
            }),
            ...(payload.permanentAddress !== undefined && {
                permanentAddress: payload.permanentAddress,
            }),
        };

        const updated = await this.prisma.workerProfile.update({
            where: { id: worker.id },
            data: updateData,
        });

        return {
            message: "Worker profile updated successfully",
            data: { id: updated.id },
        };
    }

    // ── Withdraw Methods ─────────────────────────────────────────────────────

    async createWithdraw(
        workerIdentifier: string,
        payload: CreateWithdrawDto,
        user: UserPayload,
    ) {
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

        // Only the worker themselves can submit a withdrawal.
        if (workerProfile.workerId !== user.id) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Workers can only submit withdrawal requests for themselves",
            );
        }

        if (payload.amount > workerProfile.currentEarnings) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                `Withdrawal amount exceeds current earnings (${workerProfile.currentEarnings})`,
            );
        }

        const withdraw = await this.prisma.withdraw.create({
            data: {
                workerId: workerProfile.workerId,
                amount: payload.amount,
                status: TApplyStatus.Pending,
            },
        });

        await this.activityLogger.log({
            projectId: workerProfile.projectId ?? null,
            actorId: user.id,
            action: "WITHDRAW_REQUESTED",
            entityType: "Withdraw",
            entityId: withdraw.id,
            metadata: {
                amount: payload.amount,
                workerId: workerProfile.workerId,
            },
        });

        return {
            message: "Withdrawal request submitted successfully",
            data: { id: withdraw.id },
        };
    }

    async getWithdraws(
        workerIdentifier: string,
        query: Record<string, any>,
        user: UserPayload,
    ) {
        const workerProfile = await this.prisma.workerProfile.findFirst({
            where: {
                OR: [{ id: workerIdentifier }, { workerId: workerIdentifier }],
            },
            include: { project: true },
        });

        if (!workerProfile) {
            throw new ApiError(
                HttpStatus.NOT_FOUND,
                "Worker profile not found",
            );
        }

        // Rule #1 scoping
        if (
            user.role === UserRole.WORKER &&
            workerProfile.workerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Workers can only view their own withdrawals",
            );
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            workerProfile.projectId &&
            workerProfile.project?.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Access denied to this worker's withdrawals",
            );
        }

        const scopedQuery = { ...query, workerId: workerProfile.workerId };
        const queryBuilder = new QueryBuilder<
            typeof this.prisma.withdraw,
            Prisma.$WithdrawPayload
        >(this.prisma.withdraw, scopedQuery);

        const response = await queryBuilder
            .sort()
            .filter({ exacts: ["status"] })
            .paginate()
            .execute();

        const pagination = await queryBuilder.countTotal();

        return {
            message: "Withdrawals fetched successfully",
            data: response,
            pagination,
        };
    }

    async reviewWithdraw(
        workerIdentifier: string,
        withdrawId: string,
        payload: ReviewWithdrawDto,
        user: UserPayload,
    ) {
        const workerProfile = await this.prisma.workerProfile.findFirst({
            where: {
                OR: [{ id: workerIdentifier }, { workerId: workerIdentifier }],
            },
            include: { project: true },
        });

        if (!workerProfile) {
            throw new ApiError(
                HttpStatus.NOT_FOUND,
                "Worker profile not found",
            );
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            workerProfile.projectId &&
            workerProfile.project?.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Access denied to review this withdrawal",
            );
        }

        const withdraw = await this.prisma.withdraw.findUnique({
            where: { id: withdrawId },
        });

        if (!withdraw || withdraw.workerId !== workerProfile.workerId) {
            throw new ApiError(
                HttpStatus.NOT_FOUND,
                "Withdrawal request not found",
            );
        }

        if (withdraw.status !== TApplyStatus.Pending) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "Only pending withdrawal requests can be reviewed",
            );
        }

        if (payload.status === TApplyStatus.Accepted) {
            if (withdraw.amount > workerProfile.currentEarnings) {
                throw new ApiError(
                    HttpStatus.BAD_REQUEST,
                    `Cannot accept: withdrawal amount (${withdraw.amount}) exceeds current earnings (${workerProfile.currentEarnings})`,
                );
            }

            await this.prisma.$transaction(async (tx) => {
                const updated = await tx.workerProfile.updateMany({
                    where: {
                        id: workerProfile.id,
                        currentEarnings: { gte: withdraw.amount },
                    },
                    data: { currentEarnings: { decrement: withdraw.amount } },
                });

                if (updated.count !== 1) {
                    throw new ApiError(
                        HttpStatus.BAD_REQUEST,
                        "Cannot accept: withdrawal exceeds current earnings",
                    );
                }

                await tx.withdraw.update({
                    where: { id: withdrawId },
                    data: { status: TApplyStatus.Accepted },
                });
            });
        } else {
            await this.prisma.withdraw.update({
                where: { id: withdrawId },
                data: { status: TApplyStatus.Rejected },
            });
        }

        await this.activityLogger.log({
            projectId: workerProfile.projectId ?? null,
            actorId: user.id,
            action: "WITHDRAW_REVIEWED",
            entityType: "Withdraw",
            entityId: withdrawId,
            metadata: {
                status: payload.status,
                amount: withdraw.amount,
                note: payload.note,
            },
        });

        return {
            message: `Withdrawal request ${payload.status.toLowerCase()} successfully`,
            data: { id: withdrawId, status: payload.status },
        };
    }

    // ── Worker Earnings ──────────────────────────────────────────────────────

    async getWorkerEarnings(
        workerIdentifier: string,
        query: { from?: string; to?: string },
        user: UserPayload,
    ) {
        const workerProfile = await this.prisma.workerProfile.findFirst({
            where: {
                OR: [{ id: workerIdentifier }, { workerId: workerIdentifier }],
            },
            include: { project: true },
        });

        if (!workerProfile) {
            throw new ApiError(
                HttpStatus.NOT_FOUND,
                "Worker profile not found",
            );
        }

        // Rule #1 scoping
        if (
            user.role === UserRole.WORKER &&
            workerProfile.workerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Workers can only view their own earnings",
            );
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            workerProfile.projectId &&
            workerProfile.project?.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Access denied to this worker's earnings",
            );
        }

        const fromDate = query.from ? new Date(query.from) : undefined;
        const toDate = query.to ? new Date(query.to) : undefined;

        // Fetch attendances and active overtime rate in parallel (Rule #8 two-level parallelism)
        const [attendances, activeRate] = await Promise.all([
            this.prisma.attendance.findMany({
                where: {
                    workerId: workerProfile.id,
                    ...(workerProfile.projectId
                        ? { projectId: workerProfile.projectId }
                        : {}),
                    status: {
                        in: [
                            AttendanceStatus.Present,
                            AttendanceStatus.Half_Day,
                        ],
                    },
                    ...(fromDate || toDate
                        ? {
                              date: {
                                  ...(fromDate ? { gte: fromDate } : {}),
                                  ...(toDate ? { lte: toDate } : {}),
                              },
                          }
                        : {}),
                },
                orderBy: { date: "asc" },
            }),
            workerProfile.projectId
                ? this.prisma.projectWorkerRate.findFirst({
                      where: {
                          projectId: workerProfile.projectId,
                          category: workerProfile.workerCategory,
                          isActive: true,
                      },
                      orderBy: { effectiveFrom: "desc" },
                  })
                : Promise.resolve(null),
        ]);

        const dailyRate = workerProfile.dailyRate;
        const overtimeRate = activeRate?.overtimeRate ?? 0;

        let grossEarnings = 0;
        const breakdown = attendances.map((a) => {
            const base =
                a.status === AttendanceStatus.Half_Day
                    ? dailyRate / 2
                    : dailyRate;
            const overtimePay = (a.overtimeHours ?? 0) * overtimeRate;
            const dayTotal = base + overtimePay;
            grossEarnings += dayTotal;
            return {
                date: a.date,
                status: a.status,
                base,
                overtimeHours: a.overtimeHours,
                overtimePay,
                total: dayTotal,
            };
        });

        const paymentsResult = await this.prisma.payment.aggregate({
            _sum: { amount: true },
            where: {
                workerId: workerProfile.workerId,
                ...(workerProfile.projectId
                    ? { projectId: workerProfile.projectId }
                    : {}),
                ...(fromDate || toDate
                    ? {
                          createdAt: {
                              ...(fromDate ? { gte: fromDate } : {}),
                              ...(toDate ? { lte: toDate } : {}),
                          },
                      }
                    : {}),
            },
        });

        const totalPayments = paymentsResult._sum.amount ?? 0;
        const outstanding = Math.max(0, grossEarnings - totalPayments);

        return {
            message: "Worker earnings computed successfully",
            data: {
                workerId: workerProfile.workerId,
                workerProfileId: workerProfile.id,
                projectId: workerProfile.projectId,
                dailyRate,
                overtimeRate,
                grossEarnings,
                payments: totalPayments,
                totalPayments,
                outstanding,
                currentEarnings: workerProfile.currentEarnings,
                outstandingAmount: workerProfile.outstandingAmount,
                allTimeEarnings: workerProfile.allTimeEarnings,
                period: { from: fromDate ?? null, to: toDate ?? null },
                breakdown,
            },
        };
    }
}
