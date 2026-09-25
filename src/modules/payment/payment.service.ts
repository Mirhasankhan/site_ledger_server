import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/services/prisma/prisma.service";
import { CreatePaymentDto } from "./dto/body.dto";
import { UserPayload } from "@/common/guards/auth.guard";
import { ApiError } from "@/common/errors/api_error";
import { Prisma, UserRole } from "@prisma/client";
import QueryBuilder from "@/common/utils/queryBuilder";
import { ActivityLoggerService } from "@/core/services/activity/activity_logger.service";

@Injectable()
export class PaymentService {
    constructor(
        private prisma: PrismaService,
        private activityLogger: ActivityLoggerService,
    ) {}

    async createPayment(
        payload: CreatePaymentDto,
        user: UserPayload,
    ): Promise<{ message: string; data: any }> {
        throw new ApiError(
            HttpStatus.BAD_REQUEST,
            "Direct offline worker payments are disabled. Workers must receive payouts exclusively by withdrawing their earned balance through Stripe Connect.",
        );
    }

    async fetchAllPayments(query: Record<string, any>, user: UserPayload) {
        const scopedQuery = { ...query };
        let projectScope: Prisma.PaymentWhereInput | undefined;

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
                    "Access denied to payments for this project",
                );
            }

            if (!scopedQuery.projectId) {
                projectScope = { projectId: { in: managedIds } };
            }
        } else if (user.role === UserRole.WORKER) {
            scopedQuery.workerId = user.id;
        }

        const queryBuilder = new QueryBuilder<
            typeof this.prisma.payment,
            Prisma.$PaymentPayload
        >(this.prisma.payment, scopedQuery);

        const response = await queryBuilder
            .rawFilter(projectScope ?? {})
            .sort()
            .filter({ exacts: ["workerId", "projectId", "method"] })
            .paginate()
            .include({
                worker: {
                    select: { id: true, userName: true, email: true },
                },
                project: {
                    select: { id: true, projectName: true, projectCode: true },
                },
                recordedBy: {
                    select: { id: true, userName: true },
                },
            })
            .execute();

        const pagination = await queryBuilder.countTotal();

        return {
            message: "Payments fetched successfully",
            data: response,
            pagination,
        };
    }

    async fetchSinglePayment(id: string, user: UserPayload) {
        const payment = await this.prisma.payment.findUnique({
            where: { id },
            include: {
                worker: { select: { id: true, userName: true, email: true } },
                project: {
                    select: { id: true, projectName: true, managerId: true },
                },
                recordedBy: { select: { id: true, userName: true } },
            },
        });

        if (!payment) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Payment not found");
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            payment.project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Access denied to this payment",
            );
        }

        if (user.role === UserRole.WORKER && payment.workerId !== user.id) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Access denied to this payment",
            );
        }

        return {
            message: "Payment fetched successfully",
            data: payment,
        };
    }

    async deletePayment(id: string, user: UserPayload) {
        const payment = await this.prisma.payment.findUnique({
            where: { id },
            include: { project: true },
        });

        if (!payment) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Payment not found");
        }

        // Only Admin can delete payments (reversal)
        if (user.role !== UserRole.ADMIN) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Only Admin can delete/reverse payments",
            );
        }

        // Reversal: re-increment outstandingAmount inside transaction
        await this.prisma.$transaction(async (tx) => {
            await tx.workerProfile.updateMany({
                where: {
                    workerId: payment.workerId,
                    projectId: payment.projectId,
                },
                data: {
                    outstandingAmount: { increment: payment.amount },
                    allTimeEarnings: { decrement: payment.amount },
                    currentEarnings: { decrement: payment.amount },
                },
            });

            await tx.payment.delete({ where: { id } });
        });

        await this.activityLogger.log({
            projectId: payment.projectId,
            actorId: user.id,
            action: "PAYMENT_REVERSED",
            entityType: "Payment",
            entityId: id,
            metadata: {
                workerId: payment.workerId,
                amount: payment.amount,
            },
        });

        return {
            message: "Payment reversed and deleted successfully",
            data: { id },
        };
    }
}
