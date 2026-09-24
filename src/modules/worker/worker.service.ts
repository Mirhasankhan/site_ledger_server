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
    AttendanceSource,
    AttendanceStatus,
    Prisma,
    TApplyStatus,
    UserRole,
} from "@prisma/client";
import QueryBuilder from "@/common/utils/queryBuilder";
import { ActivityLoggerService } from "@/core/services/activity/activity_logger.service";
import { StripeService } from "@/core/services/stripe/stripe.service";
import config from "@/config";

export function safeWorkerProfileWhere(identifier?: string): Prisma.WorkerProfileWhereInput {
    if (!identifier || typeof identifier !== "string" || !identifier.trim()) {
        return { id: "000000000000000000000000" };
    }
    const cleanId = identifier.trim();
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(cleanId);
    return isObjectId
        ? { OR: [{ id: cleanId }, { workerId: cleanId }] }
        : { workerId: cleanId };
}

@Injectable()
export class WorkerService {
    constructor(
        private prisma: PrismaService,
        private activityLogger: ActivityLoggerService,
        private stripeService: StripeService,
    ) {}


    async fetchAllWorkers(query: Record<string, any>, user: UserPayload) {
        const scopedQuery = { ...query };
        let siteManagerFilter: Prisma.WorkerProfileWhereInput | undefined;

        // Rule #1: Scoping check
        if (user.role === UserRole.WORKER) {
            scopedQuery.workerId = user.id;
        } else if (user.role === UserRole.SITE_MANAGER) {
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
                    "Access denied to workers in this project",
                );
            }

            if (!scopedQuery.projectId) {
                siteManagerFilter = {
                    OR: [
                        { projectId: null },
                        { projectId: { in: managedIds } },
                    ],
                };
            }
        }

        const queryBuilder = new QueryBuilder<
            typeof this.prisma.workerProfile,
            Prisma.$WorkerProfilePayload
        >(this.prisma.workerProfile, scopedQuery);

        const response = await queryBuilder
            .rawFilter(siteManagerFilter ?? {})
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

        const pagination = await queryBuilder.countTotal();

        return {
            message: "Workers fetched successfully",
            data: response,
            pagination,
        };
    }

    async fetchSingleWorker(workerIdentifier: string, user: UserPayload) {
        const worker = await this.prisma.workerProfile.findFirst({
            where: safeWorkerProfileWhere(workerIdentifier),
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
            where: safeWorkerProfileWhere(workerIdentifier),
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

    // ── Financial Sync Method ────────────────────────────────────────────────
    async syncWorkerFinancials(
        workerProfileId: string,
        tx?: Prisma.TransactionClient,
    ) {
        const client = tx || this.prisma;

        const profile = await client.workerProfile.findFirst({
            where: safeWorkerProfileWhere(workerProfileId),
            include: {
                project: true,
            },
        });

        if (!profile) return null;

        // Fetch verified shifts: Present or Half_Day, verified or manager-marked
        const attendances = await client.attendance.findMany({
            where: {
                workerId: profile.id,
                status: {
                    in: [AttendanceStatus.Present, AttendanceStatus.Half_Day],
                },
                OR: [
                    { verifiedAt: { not: null } },
                    { source: AttendanceSource.Manager },
                ],
            },
            include: {
                project: {
                    include: {
                        workerRates: {
                            where: {
                                category: profile.workerCategory,
                                isActive: true,
                            },
                            orderBy: { effectiveFrom: "desc" },
                        },
                    },
                },
            },
        });

        // Fetch all withdraws for this worker
        const withdraws = await client.withdraw.findMany({
            where: { workerId: profile.workerId },
        });

        const acceptedWithdrawals = withdraws
            .filter((w) => w.status === TApplyStatus.Accepted)
            .reduce((sum, w) => sum + w.amount, 0);

        const pendingWithdrawals = withdraws
            .filter((w) => w.status === TApplyStatus.Pending)
            .reduce((sum, w) => sum + w.amount, 0);

        let allTimeGross = 0;
        let currentProjectGross = 0;

        for (const att of attendances) {
            const dailyRate =
                profile.dailyRate ||
                att.project?.workerRates?.[0]?.dailyRate ||
                0;
            const overtimeRate =
                att.project?.workerRates?.[0]?.overtimeRate || 0;

            const base =
                att.status === AttendanceStatus.Half_Day
                    ? Math.floor(dailyRate / 2)
                    : dailyRate;
            const overtime = Math.floor(
                (att.overtimeHours || 0) * overtimeRate,
            );
            const total = base + overtime;

            allTimeGross += total;
            if (profile.projectId && att.projectId === profile.projectId) {
                currentProjectGross += total;
            }
        }

        // Available balance: total gross minus all settled and pending withdrawals
        const currentEarnings = Math.max(
            0,
            allTimeGross - acceptedWithdrawals - pendingWithdrawals,
        );

        // Project settled withdrawals
        const projectAcceptedWithdrawals = withdraws
            .filter(
                (w) =>
                    w.status === TApplyStatus.Accepted &&
                    (!w.projectId ||
                        (profile.projectId &&
                            w.projectId === profile.projectId)),
            )
            .reduce((sum, w) => sum + w.amount, 0);

        // Outstanding unpaid earnings on current project
        const outstandingAmount = Math.max(
            0,
            currentProjectGross - projectAcceptedWithdrawals,
        );

        const updated = await client.workerProfile.update({
            where: { id: profile.id },
            data: {
                allTimeEarnings: allTimeGross,
                currentEarnings,
                outstandingAmount,
            },
        });

        return {
            workerProfile: updated,
            allTimeGross,
            currentEarnings,
            acceptedWithdrawals,
            pendingWithdrawals,
            outstandingAmount,
            currentProjectGross,
        };
    }

    // ── Withdraw Methods ─────────────────────────────────────────────────────

    async createWithdraw(
        workerIdentifier: string,
        payload: CreateWithdrawDto,
        user: UserPayload,
    ) {
        const workerProfile = await this.prisma.workerProfile.findFirst({
            where: safeWorkerProfileWhere(workerIdentifier),
            include: { worker: true },
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

        if (payload.amount <= 0) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "Withdrawal amount must be greater than zero",
            );
        }

        // Synchronize financials first to guarantee live balance
        const financials = await this.syncWorkerFinancials(workerProfile.id);
        const available =
            financials?.currentEarnings ?? workerProfile.currentEarnings;

        if (payload.amount > available) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                `Withdrawal amount ($${payload.amount}) exceeds available earnings ($${available})`,
            );
        }

        const frontendUrl = config.url.frontend || "http://localhost:3000";
        const refreshUrl = `${frontendUrl}/worker/earnings?stripe=refresh`;
        const returnUrl = `${frontendUrl}/worker/earnings?stripe=return`;

        // Check if worker has connected their Stripe account
        if (!workerProfile.stripeAccountId) {
            try {
                const account = await this.stripeService.createConnectAccount(
                    workerProfile.worker.email,
                    {
                        workerId: workerProfile.workerId,
                        workerProfileId: workerProfile.id,
                    },
                );

                await this.prisma.workerProfile.update({
                    where: { id: workerProfile.id },
                    data: { stripeAccountId: account.id },
                });

                const onboardingUrl = await this.stripeService.createAccountLink(
                    account.id,
                    returnUrl,
                    refreshUrl,
                );

                return {
                    message:
                        "Please complete your Stripe account onboarding to enable payouts",
                    data: {
                        requiresOnboarding: true,
                        onboardingUrl,
                    },
                };
            } catch (err: any) {
                throw new ApiError(
                    HttpStatus.BAD_GATEWAY,
                    `Stripe Connect error: ${err.message || "Failed to create Stripe account"}`,
                );
            }
        }

        // Verify account onboarding status with Stripe
        try {
            const status = await this.stripeService.getAccountStatus(
                workerProfile.stripeAccountId,
            );

            if (!status.detailsSubmitted) {
                const onboardingUrl = await this.stripeService.createAccountLink(
                    workerProfile.stripeAccountId,
                    returnUrl,
                    refreshUrl,
                );

                return {
                    message:
                        "Please complete your Stripe account onboarding to request withdrawals",
                    data: {
                        requiresOnboarding: true,
                        onboardingUrl,
                    },
                };
            }
        } catch (err: any) {
            throw new ApiError(
                HttpStatus.BAD_GATEWAY,
                `Stripe Connect error: ${err.message || "Failed to verify Stripe account"}`,
            );
        }

        const withdraw = await this.prisma.withdraw.create({
            data: {
                workerId: workerProfile.workerId,
                amount: payload.amount,
                status: TApplyStatus.Pending,
                projectId: workerProfile.projectId ?? null,
            },
        });

        // Immediately sync financials so pending withdrawal reserves the balance
        await this.syncWorkerFinancials(workerProfile.id);

        await this.activityLogger.log({
            projectId: workerProfile.projectId ?? null,
            actorId: user.id,
            action: "WITHDRAW_REQUESTED",
            entityType: "Withdraw",
            entityId: withdraw.id,
            metadata: {
                amount: payload.amount,
                workerId: workerProfile.workerId,
                stripeAccountId: workerProfile.stripeAccountId,
            },
        });

        return {
            message:
                "Withdrawal request submitted successfully. Pending administrator review.",
            data: {
                requiresOnboarding: false,
                id: withdraw.id,
            },
        };
    }

    async getStripeConnectStatus(workerIdentifier: string, user: UserPayload) {
        const workerProfile = await this.prisma.workerProfile.findFirst({
            where: safeWorkerProfileWhere(workerIdentifier),
        });

        if (!workerProfile) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Worker profile not found");
        }

        if (user.role === UserRole.WORKER && workerProfile.workerId !== user.id) {
            throw new ApiError(HttpStatus.FORBIDDEN, "Access denied");
        }

        if (!workerProfile.stripeAccountId) {
            return {
                message: "Stripe status retrieved",
                data: {
                    isConnected: false,
                    detailsSubmitted: false,
                    payoutsEnabled: false,
                    stripeAccountId: null,
                },
            };
        }

        try {
            const status = await this.stripeService.getAccountStatus(
                workerProfile.stripeAccountId,
            );
            return {
                message: "Stripe status retrieved",
                data: {
                    isConnected: true,
                    detailsSubmitted: status.detailsSubmitted,
                    payoutsEnabled: status.payoutsEnabled,
                    stripeAccountId: workerProfile.stripeAccountId,
                },
            };
        } catch (err: any) {
            return {
                message: "Stripe status check failed",
                data: {
                    isConnected: false,
                    detailsSubmitted: false,
                    payoutsEnabled: false,
                    stripeAccountId: workerProfile.stripeAccountId,
                    error: err.message,
                },
            };
        }
    }

    async getStripeOnboardingLink(workerIdentifier: string, user: UserPayload) {
        const workerProfile = await this.prisma.workerProfile.findFirst({
            where: safeWorkerProfileWhere(workerIdentifier),
            include: { worker: true },
        });

        if (!workerProfile) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Worker profile not found");
        }

        if (user.role === UserRole.WORKER && workerProfile.workerId !== user.id) {
            throw new ApiError(HttpStatus.FORBIDDEN, "Access denied");
        }

        const frontendUrl = config.url.frontend || "http://localhost:3000";
        const refreshUrl = `${frontendUrl}/worker/earnings?stripe=refresh`;
        const returnUrl = `${frontendUrl}/worker/earnings?stripe=return`;

        let accountId = workerProfile.stripeAccountId;
        if (!accountId) {
            try {
                const account = await this.stripeService.createConnectAccount(
                    workerProfile.worker.email,
                    {
                        workerId: workerProfile.workerId,
                        workerProfileId: workerProfile.id,
                    },
                );
                accountId = account.id;
                await this.prisma.workerProfile.update({
                    where: { id: workerProfile.id },
                    data: { stripeAccountId: accountId },
                });
            } catch (err: any) {
                throw new ApiError(
                    HttpStatus.BAD_GATEWAY,
                    `Stripe Connect error: ${err.message || "Failed to create Stripe account"}`,
                );
            }
        }

        try {
            const onboardingUrl = await this.stripeService.createAccountLink(
                accountId,
                returnUrl,
                refreshUrl,
            );

            return {
                message: "Onboarding link generated",
                data: { url: onboardingUrl },
            };
        } catch (err: any) {
            throw new ApiError(
                HttpStatus.BAD_GATEWAY,
                `Stripe Connect error: ${err.message || "Failed to generate onboarding link"}`,
            );
        }
    }

    async getAllWithdraws(query: Record<string, any>, user: UserPayload) {
        const where: Prisma.WithdrawWhereInput = {};

        if (user.role === UserRole.WORKER) {
            where.workerId = user.id;
        } else if (user.role === UserRole.SITE_MANAGER) {
            const managedProjects = await this.prisma.project.findMany({
                where: { managerId: user.id },
                select: { id: true },
            });
            const projectIds = managedProjects.map((p) => p.id);
            const workersInProjects = await this.prisma.workerProfile.findMany({
                where: { projectId: { in: projectIds } },
                select: { workerId: true },
            });
            where.workerId = { in: workersInProjects.map((w) => w.workerId) };
        }

        if (query.status) {
            where.status = query.status as TApplyStatus;
        }

        const withdraws = await this.prisma.withdraw.findMany({
            where,
            orderBy: { createdAt: "desc" },
            include: {
                worker: {
                    select: {
                        id: true,
                        userName: true,
                        email: true,
                        profileImage: true,
                        workerProfile: {
                            select: {
                                id: true,
                                workerCategory: true,
                                currentEarnings: true,
                                stripeAccountId: true,
                                projectId: true,
                                project: {
                                    select: {
                                        id: true,
                                        projectName: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        return {
            message: "All withdrawal requests fetched successfully",
            data: withdraws,
        };
    }

    async getWithdraws(
        workerIdentifier: string,
        query: Record<string, any>,
        user: UserPayload,
    ) {
        const workerProfile = await this.prisma.workerProfile.findFirst({
            where: safeWorkerProfileWhere(workerIdentifier),
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

        const where: Prisma.WithdrawWhereInput = {
            workerId: workerProfile.workerId,
            ...(query.status ? { status: query.status as TApplyStatus } : {}),
        };

        const page = Math.max(1, Number(query.page) || 1);
        const limit = Math.max(1, Number(query.limit) || 50);
        const skip = (page - 1) * limit;

        const [withdraws, total] = await Promise.all([
            this.prisma.withdraw.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
            }),
            this.prisma.withdraw.count({ where }),
        ]);

        return {
            message: "Withdrawals fetched successfully",
            data: withdraws,
            pagination: {
                page,
                limit,
                total,
                totalPage: Math.ceil(total / limit),
            },
        };
    }

    async reviewWithdraw(
        workerIdentifier: string,
        withdrawId: string,
        payload: ReviewWithdrawDto,
        user: UserPayload,
    ) {
        const workerProfile = await this.prisma.workerProfile.findFirst({
            where: safeWorkerProfileWhere(workerIdentifier),
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
            const financials = await this.syncWorkerFinancials(workerProfile.id);
            const totalGross = financials?.allTimeGross ?? 0;
            const alreadyAccepted = financials?.acceptedWithdrawals ?? 0;
            const availableForSettlement = Math.max(
                0,
                totalGross - alreadyAccepted,
            );

            if (withdraw.amount > availableForSettlement) {
                throw new ApiError(
                    HttpStatus.BAD_REQUEST,
                    `Cannot accept: withdrawal amount ($${withdraw.amount}) exceeds unwithdrawn earnings ($${availableForSettlement})`,
                );
            }

            if (!workerProfile.stripeAccountId) {
                throw new ApiError(
                    HttpStatus.BAD_REQUEST,
                    "Cannot transfer funds: Worker does not have a connected Stripe account.",
                );
            }

            // Execute Stripe Transfer to Worker's Connected Account
            let transferResult: any = null;
            try {
                transferResult =
                    await this.stripeService.transferMoneyToConnectedWorker(
                        workerProfile.stripeAccountId,
                        withdraw.amount,
                    );
            } catch (err: any) {
                throw new ApiError(
                    HttpStatus.BAD_GATEWAY,
                    `Stripe transfer failed: ${err.message || "Unable to transfer funds via Stripe"}`,
                );
            }

            await this.prisma.withdraw.update({
                where: { id: withdrawId },
                data: {
                    status: TApplyStatus.Accepted,
                    transferId: transferResult?.id ?? null,
                    note: payload.note ?? null,
                },
            });

            await this.syncWorkerFinancials(workerProfile.id);
        } else {
            await this.prisma.withdraw.update({
                where: { id: withdrawId },
                data: {
                    status: TApplyStatus.Rejected,
                    note: payload.note ?? null,
                },
            });

            await this.syncWorkerFinancials(workerProfile.id);
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
            where: safeWorkerProfileWhere(workerIdentifier),
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

        const financials = await this.syncWorkerFinancials(workerProfile.id);

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
                    OR: [
                        { verifiedAt: { not: null } },
                        { source: AttendanceSource.Manager },
                    ],
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
                include: {
                    project: {
                        select: {
                            id: true,
                            projectName: true,
                            projectCode: true,
                        },
                    },
                },
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

        let periodGross = 0;
        const breakdown = attendances.map((a) => {
            const base =
                a.status === AttendanceStatus.Half_Day
                    ? Math.floor(dailyRate / 2)
                    : dailyRate;
            const overtimePay = Math.floor(
                (a.overtimeHours ?? 0) * overtimeRate,
            );
            const dayTotal = base + overtimePay;
            periodGross += dayTotal;
            return {
                id: a.id,
                date: a.date,
                projectName: a.project?.projectName,
                status: a.status,
                base,
                overtimeHours: a.overtimeHours,
                overtimePay,
                total: dayTotal,
            };
        });

        return {
            message: "Worker earnings computed successfully",
            data: {
                workerId: workerProfile.workerId,
                workerProfileId: workerProfile.id,
                projectId: workerProfile.projectId,
                dailyRate,
                overtimeRate,
                grossEarnings: financials?.allTimeGross ?? 0,
                periodGross,
                totalWithdrawn: financials?.acceptedWithdrawals ?? 0,
                pendingWithdrawals: financials?.pendingWithdrawals ?? 0,
                availableBalance: financials?.currentEarnings ?? 0,
                currentEarnings: financials?.currentEarnings ?? 0,
                outstanding: financials?.outstandingAmount ?? 0,
                outstandingAmount: financials?.outstandingAmount ?? 0,
                allTimeEarnings: financials?.allTimeGross ?? 0,
                period: { from: fromDate ?? null, to: toDate ?? null },
                breakdown,
            },
        };
    }
}
