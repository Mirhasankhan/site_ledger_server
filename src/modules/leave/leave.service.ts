import { HttpStatus, Injectable } from "@nestjs/common";
import {
    AttendanceSource,
    AttendanceStatus,
    Prisma,
    TApplyStatus,
    UserRole,
} from "@prisma/client";
import { ApiError } from "@/common/errors/api_error";
import { UserPayload } from "@/common/guards/auth.guard";
import { ActivityLoggerService } from "@/core/services/activity/activity_logger.service";
import { PrismaService } from "@/core/services/prisma/prisma.service";
import QueryBuilder from "@/common/utils/queryBuilder";
import { CreateLeaveDto, ReviewLeaveDto } from "./dto/body.dto";

@Injectable()
export class LeaveService {
    constructor(
        private prisma: PrismaService,
        private activityLogger: ActivityLoggerService,
    ) {}

    async createLeave(payload: CreateLeaveDto, user: UserPayload) {
        const workerProfile = await this.prisma.workerProfile.findFirst({
            where: {
                OR: [{ id: payload.workerId }, { workerId: payload.workerId }],
            },
        });
        const project = await this.prisma.project.findUnique({
            where: { id: payload.projectId },
        });

        if (!workerProfile) {
            throw new ApiError(
                HttpStatus.NOT_FOUND,
                "Worker profile not found",
            );
        }
        if (!project) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
        }
        if (workerProfile.projectId !== project.id) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "Worker is not assigned to this project",
            );
        }
        if (
            user.role === UserRole.WORKER &&
            workerProfile.workerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Workers can only request leave for themselves",
            );
        }
        if (
            user.role === UserRole.SITE_MANAGER &&
            project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "You can only request leave for projects you manage",
            );
        }

        const startDate = new Date(payload.startDate);
        const endDate = new Date(payload.endDate);
        if (startDate > endDate) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "Leave start date must be before its end date",
            );
        }

        const leave = await this.prisma.leaveRequest.create({
            data: {
                workerId: workerProfile.id,
                projectId: project.id,
                leaveType: payload.leaveType,
                startDate,
                endDate,
                reason: payload.reason,
            },
        });

        await this.activityLogger.log({
            projectId: project.id,
            actorId: user.id,
            action: "LEAVE_REQUESTED",
            entityType: "LeaveRequest",
            entityId: leave.id,
            metadata: {
                workerId: workerProfile.workerId,
                startDate,
                endDate,
                leaveType: leave.leaveType,
            },
        });

        return {
            message: "Leave request submitted successfully",
            data: { id: leave.id },
        };
    }

    async fetchAllLeaves(query: Record<string, unknown>, user: UserPayload) {
        const scopedQuery = { ...query };
        let projectScope: Prisma.LeaveRequestWhereInput | undefined;
        if (user.role === UserRole.WORKER) {
            const workerProfile = await this.prisma.workerProfile.findUnique({
                where: { workerId: user.id },
            });
            if (!workerProfile) {
                return {
                    message: "Leave requests fetched successfully",
                    data: [],
                    pagination: { page: 1, limit: 10, total: 0, totalPage: 0 },
                };
            }
            scopedQuery.workerId = workerProfile.id;
        } else if (user.role === UserRole.SITE_MANAGER) {
            const projects = await this.prisma.project.findMany({
                where: { managerId: user.id },
                select: { id: true },
            });
            const projectIds = projects.map((project) => project.id);
            const requestedProjectId =
                typeof scopedQuery.projectId === "string"
                    ? scopedQuery.projectId
                    : undefined;
            if (
                requestedProjectId &&
                !projectIds.includes(requestedProjectId)
            ) {
                throw new ApiError(
                    HttpStatus.FORBIDDEN,
                    "Access denied to leave requests for this project",
                );
            }
            if (!scopedQuery.projectId) {
                projectScope = { projectId: { in: projectIds } };
            }
        }

        const queryBuilder = new QueryBuilder<
            typeof this.prisma.leaveRequest,
            Prisma.$LeaveRequestPayload
        >(this.prisma.leaveRequest, scopedQuery);
        const response = await queryBuilder
            .rawFilter(projectScope ?? {})
            .sort()
            .filter({ exacts: ["workerId", "projectId", "status"] })
            .paginate()
            .include({
                worker: {
                    include: {
                        worker: {
                            select: { id: true, userName: true, email: true },
                        },
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
                reviewedBy: { select: { id: true, userName: true } },
            })
            .execute();
        const pagination = await queryBuilder.countTotal();

        return {
            message: "Leave requests fetched successfully",
            data: response,
            pagination,
        };
    }

    async fetchSingleLeave(id: string, user: UserPayload) {
        const leave = await this.prisma.leaveRequest.findUnique({
            where: { id },
            include: {
                worker: {
                    include: {
                        worker: {
                            select: { id: true, userName: true, email: true },
                        },
                    },
                },
                project: true,
                reviewedBy: { select: { id: true, userName: true } },
            },
        });
        if (!leave) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Leave request not found");
        }
        if (
            user.role === UserRole.WORKER &&
            leave.worker.workerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Workers can only view their own leave requests",
            );
        }
        if (
            user.role === UserRole.SITE_MANAGER &&
            leave.project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Access denied to this leave request",
            );
        }
        return { message: "Leave request fetched successfully", data: leave };
    }

    async reviewLeave(id: string, payload: ReviewLeaveDto, user: UserPayload) {
        const leave = await this.prisma.leaveRequest.findUnique({
            where: { id },
            include: { project: true, worker: true },
        });
        if (!leave) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Leave request not found");
        }
        if (
            user.role === UserRole.SITE_MANAGER &&
            leave.project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "You can only review leave for projects you manage",
            );
        }
        if (leave.status !== TApplyStatus.Pending) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "Only pending leave requests can be reviewed",
            );
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            const result = await tx.leaveRequest.update({
                where: { id },
                data: {
                    status: payload.status,
                    reviewedById: user.id,
                    reviewNote: payload.reviewNote ?? null,
                },
            });

            if (payload.status === TApplyStatus.Accepted) {
                const start = new Date(leave.startDate);
                const end = new Date(leave.endDate);
                for (
                    const date = new Date(
                        Date.UTC(
                            start.getUTCFullYear(),
                            start.getUTCMonth(),
                            start.getUTCDate(),
                        ),
                    );
                    date <= end;
                    date.setUTCDate(date.getUTCDate() + 1)
                ) {
                    const leaveDate = new Date(date);
                    await tx.attendance.upsert({
                        where: {
                            workerId_projectId_date: {
                                workerId: leave.workerId,
                                projectId: leave.projectId,
                                date: leaveDate,
                            },
                        },
                        create: {
                            workerId: leave.workerId,
                            projectId: leave.projectId,
                            date: leaveDate,
                            status: AttendanceStatus.Leave,
                            source: AttendanceSource.Manager,
                            notes: `Approved leave request ${leave.id}`,
                            markedById: user.id,
                            verifiedById: user.id,
                            verifiedAt: new Date(),
                        },
                        update: {
                            status: AttendanceStatus.Leave,
                            source: AttendanceSource.Manager,
                            notes: `Approved leave request ${leave.id}`,
                            verifiedById: user.id,
                            verifiedAt: new Date(),
                        },
                    });
                }
            }

            await this.activityLogger.log({
                tx,
                projectId: leave.projectId,
                actorId: user.id,
                action: "LEAVE_REVIEWED",
                entityType: "LeaveRequest",
                entityId: id,
                metadata: {
                    status: payload.status,
                    startDate: leave.startDate,
                    endDate: leave.endDate,
                    reviewNote: payload.reviewNote,
                },
            });
            return result;
        });

        return {
            message: `Leave request ${payload.status.toLowerCase()} successfully`,
            data: { id: updated.id, status: updated.status },
        };
    }
}
