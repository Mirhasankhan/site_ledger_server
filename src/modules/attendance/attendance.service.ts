import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/services/prisma/prisma.service";
import {
    BulkMarkAttendanceDto,
    MarkAttendanceDto,
    SelfCheckInDto,
    VerifyAttendanceDto,
} from "./dto/body.dto";
import { UserPayload } from "@/common/guards/auth.guard";
import { ApiError } from "@/common/errors/api_error";
import {
    AttendanceSource,
    AttendanceStatus,
    Prisma,
    UserRole,
} from "@prisma/client";
import QueryBuilder from "@/common/utils/queryBuilder";
import { ActivityLoggerService } from "@/core/services/activity/activity_logger.service";

@Injectable()
export class AttendanceService {
    constructor(
        private prisma: PrismaService,
        private activityLogger: ActivityLoggerService,
    ) {}

    private normalizeDate(dateStr?: string | Date): Date {
        const d = dateStr ? new Date(dateStr) : new Date();
        return new Date(
            Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
        );
    }

    private async resolveWorkerProfile(identifier: string) {
        return this.prisma.workerProfile.findFirst({
            where: { OR: [{ id: identifier }, { workerId: identifier }] },
            include: { worker: true },
        });
    }

    async markAttendance(payload: MarkAttendanceDto, user: UserPayload) {
        // Rule #4: If status is Half_Day, notes is required
        if (
            payload.status === AttendanceStatus.Half_Day &&
            !payload.notes?.trim()
        ) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "Notes are required when attendance status is Half_Day",
            );
        }

        const project = await this.prisma.project.findUnique({
            where: { id: payload.projectId },
        });

        if (!project) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
        }

        // Rule #1: Scoping check
        if (
            user.role === UserRole.SITE_MANAGER &&
            project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "You can only record attendance for projects you manage",
            );
        }

        const workerProfile = await this.resolveWorkerProfile(payload.workerId);
        if (!workerProfile) {
            throw new ApiError(
                HttpStatus.NOT_FOUND,
                "Worker profile not found",
            );
        }
        if (workerProfile.projectId !== project.id) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "Worker is not assigned to this project",
            );
        }

        const normalizedDate = this.normalizeDate(payload.date);

        // Rule #4: one record per (workerId, projectId, date) — use upsert
        const attendance = await this.prisma.attendance.upsert({
            where: {
                workerId_projectId_date: {
                    workerId: workerProfile.id,
                    projectId: project.id,
                    date: normalizedDate,
                },
            },
            create: {
                workerId: workerProfile.id,
                projectId: project.id,
                date: normalizedDate,
                status: payload.status,
                checkIn: payload.checkIn ? new Date(payload.checkIn) : null,
                checkOut: payload.checkOut ? new Date(payload.checkOut) : null,
                workingHours: payload.workingHours ?? null,
                overtimeHours: payload.overtimeHours ?? 0,
                source: AttendanceSource.Manager,
                notes: payload.notes ?? null,
                markedById: user.id,
                verifiedById: user.id,
                verifiedAt: new Date(),
            },
            update: {
                status: payload.status,
                checkIn: payload.checkIn
                    ? new Date(payload.checkIn)
                    : undefined,
                checkOut: payload.checkOut
                    ? new Date(payload.checkOut)
                    : undefined,
                workingHours: payload.workingHours ?? undefined,
                overtimeHours: payload.overtimeHours ?? undefined,
                source: AttendanceSource.Manager,
                notes: payload.notes ?? undefined,
                markedById: user.id,
                verifiedById: user.id,
                verifiedAt: new Date(),
            },
        });

        await this.activityLogger.log({
            projectId: project.id,
            actorId: user.id,
            action: "ATTENDANCE_MARKED",
            entityType: "Attendance",
            entityId: attendance.id,
            metadata: {
                workerId: workerProfile.id,
                workerName: workerProfile.worker.userName,
                status: payload.status,
                date: normalizedDate.toISOString().split("T")[0],
            },
        });

        return {
            message: "Attendance marked successfully",
            data: { id: attendance.id },
        };
    }

    async bulkMarkAttendance(
        payload: BulkMarkAttendanceDto,
        user: UserPayload,
    ) {
        const project = await this.prisma.project.findUnique({
            where: { id: payload.projectId },
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
                "You can only record attendance for projects you manage",
            );
        }

        const normalizedDate = this.normalizeDate(payload.date);
        const results: string[] = [];

        await this.prisma.$transaction(async (tx) => {
            for (const item of payload.attendances) {
                if (
                    item.status === AttendanceStatus.Half_Day &&
                    !item.notes?.trim()
                ) {
                    throw new ApiError(
                        HttpStatus.BAD_REQUEST,
                        `Notes are required for Half_Day status for worker ID: ${item.workerId}`,
                    );
                }

                const workerProfile = await tx.workerProfile.findFirst({
                    where: {
                        OR: [
                            { id: item.workerId },
                            { workerId: item.workerId },
                        ],
                    },
                });

                if (!workerProfile) continue;
                if (workerProfile.projectId !== project.id) {
                    throw new ApiError(
                        HttpStatus.BAD_REQUEST,
                        `Worker ${item.workerId} is not assigned to this project`,
                    );
                }

                const record = await tx.attendance.upsert({
                    where: {
                        workerId_projectId_date: {
                            workerId: workerProfile.id,
                            projectId: project.id,
                            date: normalizedDate,
                        },
                    },
                    create: {
                        workerId: workerProfile.id,
                        projectId: project.id,
                        date: normalizedDate,
                        status: item.status,
                        checkIn: item.checkIn ? new Date(item.checkIn) : null,
                        checkOut: item.checkOut
                            ? new Date(item.checkOut)
                            : null,
                        overtimeHours: item.overtimeHours ?? 0,
                        notes: item.notes ?? null,
                        source: AttendanceSource.Manager,
                        markedById: user.id,
                        verifiedById: user.id,
                        verifiedAt: new Date(),
                    },
                    update: {
                        status: item.status,
                        checkIn: item.checkIn
                            ? new Date(item.checkIn)
                            : undefined,
                        checkOut: item.checkOut
                            ? new Date(item.checkOut)
                            : undefined,
                        overtimeHours: item.overtimeHours ?? undefined,
                        notes: item.notes ?? undefined,
                        source: AttendanceSource.Manager,
                        markedById: user.id,
                        verifiedById: user.id,
                        verifiedAt: new Date(),
                    },
                });

                results.push(record.id);
            }
        });

        await this.activityLogger.log({
            projectId: project.id,
            actorId: user.id,
            action: "BULK_ATTENDANCE_MARKED",
            entityType: "Attendance",
            entityId: project.id,
            metadata: {
                totalMarked: results.length,
                date: normalizedDate.toISOString().split("T")[0],
            },
        });

        return {
            message: `Bulk attendance recorded for ${results.length} workers`,
            data: { count: results.length },
        };
    }

    async selfCheckIn(payload: SelfCheckInDto, user: UserPayload) {
        const workerProfile = await this.prisma.workerProfile.findUnique({
            where: { workerId: user.id },
            include: { worker: true },
        });

        if (!workerProfile) {
            throw new ApiError(
                HttpStatus.NOT_FOUND,
                "Worker profile not found",
            );
        }

        const projectId = payload.projectId ?? workerProfile.projectId;
        if (!projectId) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "Worker is not assigned to any project and none was provided",
            );
        }
        if (workerProfile.projectId !== projectId) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Workers can only check in to their assigned project",
            );
        }

        const normalizedDate = this.normalizeDate(payload.date);
        const checkInTime = payload.checkIn
            ? new Date(payload.checkIn)
            : new Date();

        // Rule #4: Self check in sets source: Self and status stays Pending_Verification
        const attendance = await this.prisma.attendance.upsert({
            where: {
                workerId_projectId_date: {
                    workerId: workerProfile.id,
                    projectId,
                    date: normalizedDate,
                },
            },
            create: {
                workerId: workerProfile.id,
                projectId,
                date: normalizedDate,
                status: AttendanceStatus.Pending_Verification,
                source: AttendanceSource.Self,
                selfCheckIn: checkInTime,
                selfCheckOut: payload.checkOut
                    ? new Date(payload.checkOut)
                    : null,
                notes: payload.notes ?? null,
            },
            update: {
                selfCheckIn: checkInTime,
                selfCheckOut: payload.checkOut
                    ? new Date(payload.checkOut)
                    : undefined,
                notes: payload.notes ?? undefined,
                // Status remains Pending_Verification until manager verification
            },
        });

        return {
            message:
                "Self check-in submitted successfully (Pending Verification)",
            data: { id: attendance.id, status: attendance.status },
        };
    }

    async verifyAttendance(
        id: string,
        payload: VerifyAttendanceDto,
        user: UserPayload,
    ) {
        if (
            payload.status === AttendanceStatus.Half_Day &&
            !payload.notes?.trim()
        ) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "Notes are required when attendance status is Half_Day",
            );
        }

        const attendance = await this.prisma.attendance.findUnique({
            where: { id },
            include: { project: true, worker: { include: { worker: true } } },
        });

        if (!attendance) {
            throw new ApiError(
                HttpStatus.NOT_FOUND,
                "Attendance record not found",
            );
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            attendance.project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "You can only verify attendance for projects you manage",
            );
        }

        // Rule #4: manager sets real status, checkIn, checkOut, overwriting self-submitted data
        const updated = await this.prisma.attendance.update({
            where: { id },
            data: {
                status: payload.status,
                checkIn: payload.checkIn
                    ? new Date(payload.checkIn)
                    : (attendance.selfCheckIn ?? attendance.checkIn),
                checkOut: payload.checkOut
                    ? new Date(payload.checkOut)
                    : (attendance.selfCheckOut ?? attendance.checkOut),
                workingHours: payload.workingHours ?? attendance.workingHours,
                overtimeHours:
                    payload.overtimeHours ?? attendance.overtimeHours,
                notes: payload.notes ?? attendance.notes,
                verifiedById: user.id,
                verifiedAt: new Date(),
            },
        });

        await this.activityLogger.log({
            projectId: attendance.projectId,
            actorId: user.id,
            action: "ATTENDANCE_VERIFIED",
            entityType: "Attendance",
            entityId: id,
            metadata: {
                workerId: attendance.workerId,
                workerName: attendance.worker.worker.userName,
                status: payload.status,
            },
        });

        return {
            message: "Attendance verified successfully",
            data: { id: updated.id },
        };
    }

    async fetchAllAttendance(query: Record<string, any>, user: UserPayload) {
        const scopedQuery = { ...query };
        let projectScope: Prisma.AttendanceWhereInput | undefined;

        // Rule #1: Scoping check
        if (user.role === UserRole.WORKER) {
            const profile = await this.prisma.workerProfile.findUnique({
                where: { workerId: user.id },
            });
            if (!profile) {
                return {
                    message: "Attendance records fetched successfully",
                    data: [],
                    pagination: { page: 1, limit: 10, total: 0, totalPage: 0 },
                };
            }
            scopedQuery.workerId = profile.id;
        } else if (user.role === UserRole.SITE_MANAGER) {
            // Site Manager can only view attendance for projects they manage
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
                    "Access denied to attendance for this project",
                );
            }
            if (!scopedQuery.projectId) {
                projectScope = { projectId: { in: managedIds } };
            }
        }

        let dateScope: Prisma.AttendanceWhereInput | undefined;
        if (scopedQuery.date) {
            dateScope = { date: this.normalizeDate(scopedQuery.date) };
            delete scopedQuery.date;
        } else if (scopedQuery.fromDate || scopedQuery.toDate) {
            const dateFilter: Prisma.DateTimeFilter = {};
            if (scopedQuery.fromDate) {
                dateFilter.gte = this.normalizeDate(scopedQuery.fromDate);
            }
            if (scopedQuery.toDate) {
                dateFilter.lte = this.normalizeDate(scopedQuery.toDate);
            }
            dateScope = { date: dateFilter };
            delete scopedQuery.fromDate;
            delete scopedQuery.toDate;
        }

        const queryBuilder = new QueryBuilder<
            typeof this.prisma.attendance,
            Prisma.$AttendancePayload
        >(this.prisma.attendance, scopedQuery);

        const response = await queryBuilder
            .rawFilter({ ...(projectScope ?? {}), ...(dateScope ?? {}) })
            .sort()
            .filter({ exacts: ["projectId", "workerId", "status", "source"] })
            .paginate()
            .include({
                worker: {
                    select: {
                        id: true,
                        workerCategory: true,
                        worker: {
                            select: {
                                id: true,
                                userName: true,
                                email: true,
                            },
                        },
                    },
                },
                project: {
                    select: {
                        id: true,
                        projectName: true,
                        projectCode: true,
                    },
                },
                verifiedBy: {
                    select: {
                        id: true,
                        userName: true,
                    },
                },
            })
            .execute();

        const pagination = await queryBuilder.countTotal();

        return {
            message: "Attendance records fetched successfully",
            data: response,
            pagination,
        };
    }

    async fetchSingleAttendance(id: string, user: UserPayload) {
        const attendance = await this.prisma.attendance.findUnique({
            where: { id },
            include: {
                worker: {
                    include: {
                        worker: true,
                    },
                },
                project: true,
                verifiedBy: true,
            },
        });

        if (!attendance) {
            throw new ApiError(
                HttpStatus.NOT_FOUND,
                "Attendance record not found",
            );
        }

        // Rule #1 scoping check
        if (
            user.role === UserRole.WORKER &&
            attendance.worker.workerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Workers can only view their own attendance records",
            );
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            attendance.project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "You can only view attendance for projects you manage",
            );
        }

        return {
            message: "Attendance record fetched successfully",
            data: attendance,
        };
    }
}
