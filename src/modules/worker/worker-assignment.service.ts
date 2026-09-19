import { ForbiddenException, HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/services/prisma/prisma.service";
import { AssignWorkerDto } from "./dto/body.dto";
import { UserPayload } from "@/common/guards/auth.guard";
import { ApiError } from "@/common/errors/api_error";
import { UserRole } from "@prisma/client";
import { ActivityLoggerService } from "@/core/services/activity/activity_logger.service";

@Injectable()
export class WorkerAssignmentService {
    constructor(
        private prisma: PrismaService,
        private activityLogger: ActivityLoggerService,
    ) {}

    async assignWorker(
        workerIdentifier: string,
        payload: AssignWorkerDto,
        user: UserPayload,
    ) {
        const workerProfile = await this.prisma.workerProfile.findFirst({
            where: {
                OR: [{ id: workerIdentifier }, { workerId: workerIdentifier }],
            },
            include: {
                worker: true,
                project: true,
            },
        });

        if (!workerProfile) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Worker profile not found");
        }

        // CRITICAL BUSINESS RULE #2:
        // A Site Manager CANNOT add a new worker to a project, or remove an existing worker
        // from it, while that worker's WorkerProfile.outstandingAmount > 0.
        // Throw ForbiddenException with a clear message.
        if (workerProfile.outstandingAmount > 0) {
            throw new ForbiddenException(
                `Cannot assign worker ${workerProfile.worker.userName} to a project because they have an outstanding balance of ${workerProfile.outstandingAmount}. Clear all outstanding payments before reassigning.`,
            );
        }

        // Verify target project exists
        const targetProject = await this.prisma.project.findUnique({
            where: { id: payload.projectId },
        });

        if (!targetProject) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Target project not found");
        }

        // CRITICAL BUSINESS RULE #1:
        // Site Manager can only read/write data for projects where they are the managerId.
        if (user.role === UserRole.SITE_MANAGER && targetProject.managerId !== user.id) {
            throw new ForbiddenException(
                "You can only assign workers to projects you manage",
            );
        }

        // If worker is already in another project, verify manager permissions on previous project as well if Site Manager
        if (
            workerProfile.projectId &&
            workerProfile.projectId !== targetProject.id &&
            user.role === UserRole.SITE_MANAGER &&
            workerProfile.project?.managerId !== user.id
        ) {
            throw new ForbiddenException(
                "Cannot reassign worker from another manager's project",
            );
        }

        // CRITICAL BUSINESS RULE #3:
        // Snapshot the currently active rate into WorkerProfile.dailyRate
        let dailyRate = payload.overrideDailyRate;
        if (dailyRate === undefined) {
            const activeRate = await this.prisma.projectWorkerRate.findFirst({
                where: {
                    projectId: targetProject.id,
                    category: workerProfile.workerCategory,
                    isActive: true,
                },
                orderBy: { effectiveFrom: "desc" },
            });

            dailyRate = activeRate?.dailyRate ?? 0;
        }

        const updatedWorker = await this.prisma.workerProfile.update({
            where: { id: workerProfile.id },
            data: {
                projectId: targetProject.id,
                dailyRate,
                assignedAt: new Date(),
            },
            include: {
                worker: true,
            },
        });

        // CRITICAL BUSINESS RULE #7 (ActivityLog) & #8 (System message in ProjectMessage)
        const systemMessage = `${updatedWorker.worker.userName} was added to the project as ${updatedWorker.workerCategory}.`;
        await this.activityLogger.log({
            projectId: targetProject.id,
            actorId: user.id,
            action: "WORKER_ADDED",
            entityType: "WorkerProfile",
            entityId: updatedWorker.id,
            metadata: {
                workerId: updatedWorker.workerId,
                workerName: updatedWorker.worker.userName,
                category: updatedWorker.workerCategory,
                dailyRate,
            },
            systemMessage,
        });

        return {
            message: "Worker successfully assigned to project",
            data: {
                id: updatedWorker.id,
                workerId: updatedWorker.workerId,
                projectId: updatedWorker.projectId,
                dailyRate: updatedWorker.dailyRate,
            },
        };
    }

    async unassignWorker(workerIdentifier: string, user: UserPayload) {
        const workerProfile = await this.prisma.workerProfile.findFirst({
            where: {
                OR: [{ id: workerIdentifier }, { workerId: workerIdentifier }],
            },
            include: {
                worker: true,
                project: true,
            },
        });

        if (!workerProfile) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Worker profile not found");
        }

        if (!workerProfile.projectId) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "Worker is not currently assigned to any project",
            );
        }

        // CRITICAL BUSINESS RULE #2:
        // A Site Manager CANNOT add a new worker to a project, or remove an existing worker
        // from it, while that worker's WorkerProfile.outstandingAmount > 0.
        // Throw ForbiddenException with a clear message.
        if (workerProfile.outstandingAmount > 0) {
            throw new ForbiddenException(
                `Cannot remove worker ${workerProfile.worker.userName} from the project because they have an outstanding balance of ${workerProfile.outstandingAmount}. Clear all outstanding payments before removing.`,
            );
        }

        // CRITICAL BUSINESS RULE #1: Scoping check
        if (
            user.role === UserRole.SITE_MANAGER &&
            workerProfile.project?.managerId !== user.id
        ) {
            throw new ForbiddenException(
                "You can only remove workers from projects you manage",
            );
        }

        const previousProjectId = workerProfile.projectId;

        const updatedWorker = await this.prisma.workerProfile.update({
            where: { id: workerProfile.id },
            data: {
                projectId: null,
                assignedAt: null,
            },
            include: {
                worker: true,
            },
        });

        // CRITICAL BUSINESS RULE #7 & #8: System message and Activity log
        const systemMessage = `${updatedWorker.worker.userName} was removed from the project.`;
        await this.activityLogger.log({
            projectId: previousProjectId,
            actorId: user.id,
            action: "WORKER_REMOVED",
            entityType: "WorkerProfile",
            entityId: updatedWorker.id,
            metadata: {
                workerId: updatedWorker.workerId,
                workerName: updatedWorker.worker.userName,
            },
            systemMessage,
        });

        return {
            message: "Worker successfully removed from project",
            data: {
                id: updatedWorker.id,
                workerId: updatedWorker.workerId,
            },
        };
    }
}
