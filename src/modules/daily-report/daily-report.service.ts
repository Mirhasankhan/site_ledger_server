import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/services/prisma/prisma.service";
import { CreateDailyReportDto, UpdateDailyReportDto } from "./dto/body.dto";
import { UserPayload } from "@/common/guards/auth.guard";
import { ApiError } from "@/common/errors/api_error";
import { Prisma, UserRole } from "@prisma/client";
import QueryBuilder from "@/common/utils/queryBuilder";
import { ActivityLoggerService } from "@/core/services/activity/activity_logger.service";

@Injectable()
export class DailyReportService {
    constructor(
        private prisma: PrismaService,
        private activityLogger: ActivityLoggerService,
    ) {}

    private normalizeDate(dateStr: string | Date): Date {
        const d = new Date(dateStr);
        return new Date(
            Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
        );
    }

    async createDailyReport(payload: CreateDailyReportDto, user: UserPayload) {
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
                "You can only submit daily reports for projects you manage",
            );
        }

        const normalizedDate = this.normalizeDate(payload.date);

        const report = await this.prisma.dailyReport.upsert({
            where: {
                projectId_date: {
                    projectId: project.id,
                    date: normalizedDate,
                },
            },
            create: {
                projectId: project.id,
                date: normalizedDate,
                weather: payload.weather ?? null,
                presentWorkers: payload.presentWorkers ?? 0,
                absentWorkers: payload.absentWorkers ?? 0,
                workCompleted: payload.workCompleted ?? null,
                workInProgress: payload.workInProgress ?? null,
                issues: payload.issues ?? null,
                delays: payload.delays ?? null,
                safetyNotes: payload.safetyNotes ?? null,
                photos: payload.photos ?? [],
                submittedById: user.id,
            },
            update: {
                weather: payload.weather ?? undefined,
                presentWorkers: payload.presentWorkers ?? undefined,
                absentWorkers: payload.absentWorkers ?? undefined,
                workCompleted: payload.workCompleted ?? undefined,
                workInProgress: payload.workInProgress ?? undefined,
                issues: payload.issues ?? undefined,
                delays: payload.delays ?? undefined,
                safetyNotes: payload.safetyNotes ?? undefined,
                photos: payload.photos ?? undefined,
                submittedById: user.id,
            },
        });

        // Rule #7: write to ActivityLog
        await this.activityLogger.log({
            projectId: project.id,
            actorId: user.id,
            action: "DAILY_REPORT_SUBMITTED",
            entityType: "DailyReport",
            entityId: report.id,
            metadata: {
                date: normalizedDate.toISOString().split("T")[0],
                presentWorkers: report.presentWorkers,
                absentWorkers: report.absentWorkers,
            },
        });

        return {
            message: "Daily report submitted successfully",
            data: { id: report.id },
        };
    }

    async fetchAllDailyReports(query: Record<string, any>, user: UserPayload) {
        const scopedQuery = { ...query };
        let projectScope: Prisma.DailyReportWhereInput | undefined;

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
                    "Access denied to reports for this project",
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
                    message: "Daily reports fetched successfully",
                    data: [],
                    pagination: { page: 1, limit: 10, total: 0, totalPage: 0 },
                };
            }
            scopedQuery.projectId = workerProfile.projectId;
        }

        let dateScope: Prisma.DailyReportWhereInput | undefined;
        if (scopedQuery.date) {
            const d = new Date(scopedQuery.date);
            dateScope = {
                date: new Date(
                    Date.UTC(
                        d.getUTCFullYear(),
                        d.getUTCMonth(),
                        d.getUTCDate(),
                    ),
                ),
            };
            delete scopedQuery.date;
        }

        const queryBuilder = new QueryBuilder<
            typeof this.prisma.dailyReport,
            Prisma.$DailyReportPayload
        >(this.prisma.dailyReport, scopedQuery);

        const response = await queryBuilder
            .rawFilter({ ...(projectScope ?? {}), ...(dateScope ?? {}) })
            .search([
                "workCompleted",
                "workInProgress",
                "issues",
                "safetyNotes",
            ])
            .sort()
            .filter({ exacts: ["projectId"] })
            .paginate()
            .include({
                submittedBy: {
                    select: {
                        id: true,
                        userName: true,
                        email: true,
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
            message: "Daily reports fetched successfully",
            data: response,
            pagination,
        };
    }

    async fetchSingleDailyReport(id: string, user: UserPayload) {
        const report = await this.prisma.dailyReport.findUnique({
            where: { id },
            include: {
                project: true,
                submittedBy: {
                    select: {
                        id: true,
                        userName: true,
                        email: true,
                    },
                },
            },
        });

        if (!report) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Daily report not found");
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            report.project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Access denied to view this daily report",
            );
        }

        if (user.role === UserRole.WORKER) {
            const workerProfile = await this.prisma.workerProfile.findUnique({
                where: { workerId: user.id },
            });
            if (workerProfile?.projectId !== report.projectId) {
                throw new ApiError(
                    HttpStatus.FORBIDDEN,
                    "Access denied to view this daily report",
                );
            }
        }

        return {
            message: "Daily report fetched successfully",
            data: report,
        };
    }

    async updateDailyReport(
        id: string,
        payload: UpdateDailyReportDto,
        user: UserPayload,
    ) {
        const report = await this.prisma.dailyReport.findUnique({
            where: { id },
            include: { project: true },
        });

        if (!report) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Daily report not found");
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            report.project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "You can only update daily reports for projects you manage",
            );
        }

        const updateData: Prisma.DailyReportUpdateInput = {
            ...(payload.weather !== undefined && { weather: payload.weather }),
            ...(payload.presentWorkers !== undefined && {
                presentWorkers: payload.presentWorkers,
            }),
            ...(payload.absentWorkers !== undefined && {
                absentWorkers: payload.absentWorkers,
            }),
            ...(payload.workCompleted !== undefined && {
                workCompleted: payload.workCompleted,
            }),
            ...(payload.workInProgress !== undefined && {
                workInProgress: payload.workInProgress,
            }),
            ...(payload.issues !== undefined && { issues: payload.issues }),
            ...(payload.delays !== undefined && { delays: payload.delays }),
            ...(payload.safetyNotes !== undefined && {
                safetyNotes: payload.safetyNotes,
            }),
            ...(payload.photos && { photos: payload.photos }),
        };

        const updated = await this.prisma.dailyReport.update({
            where: { id },
            data: updateData,
        });

        await this.activityLogger.log({
            projectId: report.projectId,
            actorId: user.id,
            action: "DAILY_REPORT_UPDATED",
            entityType: "DailyReport",
            entityId: id,
            metadata: { date: report.date.toISOString().split("T")[0] },
        });

        return {
            message: "Daily report updated successfully",
            data: { id: updated.id },
        };
    }

    async deleteDailyReport(id: string, user: UserPayload) {
        const report = await this.prisma.dailyReport.findUnique({
            where: { id },
            include: { project: true },
        });

        if (!report) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Daily report not found");
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            report.project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "You can only delete daily reports for projects you manage",
            );
        }

        await this.prisma.dailyReport.delete({
            where: { id },
        });

        await this.activityLogger.log({
            projectId: report.projectId,
            actorId: user.id,
            action: "DAILY_REPORT_DELETED",
            entityType: "DailyReport",
            entityId: id,
            metadata: { date: report.date.toISOString().split("T")[0] },
        });

        return {
            message: "Daily report deleted successfully",
            data: { id },
        };
    }
}
