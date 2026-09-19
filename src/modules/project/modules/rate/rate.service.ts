import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/services/prisma/prisma.service";
import { SetProjectWorkerRateDto } from "./dto/body.dto";
import { UserPayload } from "@/common/guards/auth.guard";
import { ApiError } from "@/common/errors/api_error";
import { UserRole } from "@prisma/client";
import { ActivityLoggerService } from "@/core/services/activity/activity_logger.service";

@Injectable()
export class RateService {
    constructor(
        private prisma: PrismaService,
        private activityLogger: ActivityLoggerService,
    ) {}

    async createRate(
        projectId: string,
        payload: SetProjectWorkerRateDto,
        user: UserPayload,
    ) {
        const project = await this.prisma.project.findUnique({
            where: { id: projectId },
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
                "You do not have permission to configure rates for this project",
            );
        }

        const newRate = await this.prisma.$transaction(async (tx) => {
            // Rule #3: Rate history pattern - never update existing rate row
            // Set current active row's isActive = false
            await tx.projectWorkerRate.updateMany({
                where: {
                    projectId,
                    category: payload.category,
                    isActive: true,
                },
                data: {
                    isActive: false,
                },
            });

            // Insert new row with new effectiveFrom
            return tx.projectWorkerRate.create({
                data: {
                    projectId,
                    category: payload.category,
                    dailyRate: payload.dailyRate,
                    overtimeRate: payload.overtimeRate ?? null,
                    isActive: true,
                    effectiveFrom: new Date(),
                },
            });
        });

        await this.activityLogger.log({
            projectId,
            actorId: user.id,
            action: "RATE_UPDATED",
            entityType: "ProjectWorkerRate",
            entityId: newRate.id,
            metadata: {
                category: payload.category,
                dailyRate: payload.dailyRate,
                overtimeRate: payload.overtimeRate,
            },
        });

        return {
            message: "Worker rate configured successfully",
            data: { id: newRate.id },
        };
    }

    async fetchAllRates(
        projectId: string,
        query: Record<string, any>,
        user: UserPayload,
    ) {
        const project = await this.prisma.project.findUnique({
            where: { id: projectId },
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
                "You do not have access to view rates for this project",
            );
        }
        if (user.role === UserRole.WORKER) {
            const workerProfile = await this.prisma.workerProfile.findUnique({
                where: { workerId: user.id },
            });
            if (workerProfile?.projectId !== project.id) {
                throw new ApiError(
                    HttpStatus.FORBIDDEN,
                    "Workers can only view rates for their assigned project",
                );
            }
        }

        const onlyActive = query?.active === "false" ? false : true;

        const rates = await this.prisma.projectWorkerRate.findMany({
            where: {
                projectId,
                ...(onlyActive ? { isActive: true } : {}),
            },
            orderBy: {
                effectiveFrom: "desc",
            },
        });

        return {
            message: "Project worker rates fetched successfully",
            data: rates,
        };
    }
}
