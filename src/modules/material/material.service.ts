import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/services/prisma/prisma.service";
import {
    CreateMaterialDto,
    CreateMaterialPurchaseDto,
    CreateMaterialRequestDto,
    CreateMaterialUsageDto,
    ReviewMaterialRequestDto,
    UpdateMaterialDto,
} from "./dto/body.dto";
import { UserPayload } from "@/common/guards/auth.guard";
import { ApiError } from "@/common/errors/api_error";
import { Prisma, UserRole } from "@prisma/client";
import QueryBuilder from "@/common/utils/queryBuilder";
import { ActivityLoggerService } from "@/core/services/activity/activity_logger.service";

@Injectable()
export class MaterialService {
    constructor(
        private prisma: PrismaService,
        private activityLogger: ActivityLoggerService,
    ) {}

    async createMaterial(payload: CreateMaterialDto, user: UserPayload) {
        const material = await this.prisma.material.create({
            data: {
                name: payload.name,
                category: payload.category,
                unit: payload.unit,
                unitCost: payload.unitCost,
                currentStock: 0,
                minimumStock: payload.minimumStock ?? 0,
                supplier: payload.supplier ?? null,
                location: payload.location ?? null,
            },
        });

        await this.activityLogger.log({
            actorId: user.id,
            action: "MATERIAL_CREATED",
            entityType: "Material",
            entityId: material.id,
            metadata: { name: material.name, category: material.category },
        });

        return {
            message: "Material created successfully",
            data: { id: material.id },
        };
    }

    async fetchAllMaterials(query: Record<string, any>, user: UserPayload) {
        const queryBuilder = new QueryBuilder<
            typeof this.prisma.material,
            Prisma.$MaterialPayload
        >(this.prisma.material, query);

        const response = await queryBuilder
            .search(["name", "supplier", "location"])
            .sort()
            .filter({ exacts: ["category", "unit"] })
            .paginate()
            .execute();

        const pagination = await queryBuilder.countTotal();

        return {
            message: "Materials fetched successfully",
            data: response,
            pagination,
        };
    }

    async fetchSingleMaterial(id: string, user: UserPayload) {
        let usageProjectFilter: Prisma.MaterialUsageWhereInput | undefined;
        if (user.role === UserRole.SITE_MANAGER) {
            usageProjectFilter = { project: { managerId: user.id } };
        } else if (user.role === UserRole.WORKER) {
            const workerProfile = await this.prisma.workerProfile.findUnique({
                where: { workerId: user.id },
            });
            usageProjectFilter = {
                projectId: workerProfile?.projectId ?? "__unassigned__",
            };
        }

        const material = await this.prisma.material.findUnique({
            where: { id },
            include: {
                purchases: {
                    orderBy: { createdAt: "desc" },
                    take: 10,
                },
                usages: {
                    orderBy: { createdAt: "desc" },
                    take: 10,
                    where: usageProjectFilter,
                    include: {
                        project: {
                            select: { id: true, projectName: true },
                        },
                    },
                },
            },
        });

        if (!material) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Material not found");
        }

        return {
            message: "Material fetched successfully",
            data: material,
        };
    }

    async updateMaterial(
        id: string,
        payload: UpdateMaterialDto,
        user: UserPayload,
    ) {
        const material = await this.prisma.material.findUnique({
            where: { id },
        });

        if (!material) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Material not found");
        }

        const updated = await this.prisma.material.update({
            where: { id },
            data: {
                ...(payload.name && { name: payload.name }),
                ...(payload.category && { category: payload.category }),
                ...(payload.unit && { unit: payload.unit }),
                ...(payload.unitCost !== undefined && {
                    unitCost: payload.unitCost,
                }),
                ...(payload.minimumStock !== undefined && {
                    minimumStock: payload.minimumStock,
                }),
                ...(payload.supplier !== undefined && {
                    supplier: payload.supplier,
                }),
                ...(payload.location !== undefined && {
                    location: payload.location,
                }),
            },
        });

        await this.activityLogger.log({
            actorId: user.id,
            action: "MATERIAL_UPDATED",
            entityType: "Material",
            entityId: id,
            metadata: { updatedFields: Object.keys(payload) },
        });

        return {
            message: "Material updated successfully",
            data: { id: updated.id },
        };
    }

    // CRITICAL BUSINESS RULE #6: MaterialPurchase increments Material.currentStock
    async createMaterialPurchase(
        materialId: string,
        payload: CreateMaterialPurchaseDto,
        user: UserPayload,
    ) {
        const material = await this.prisma.material.findUnique({
            where: { id: materialId },
        });

        if (!material) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Material not found");
        }

        const totalCost = payload.quantity * payload.unitCost;

        const result = await this.prisma.$transaction(async (tx) => {
            const purchase = await tx.materialPurchase.create({
                data: {
                    materialId: material.id,
                    quantity: payload.quantity,
                    unitCost: payload.unitCost,
                    totalCost,
                    supplier: payload.supplier ?? material.supplier,
                    date: payload.date ? new Date(payload.date) : new Date(),
                    purchasedById: user.id,
                },
            });

            // Increment currentStock
            const updatedMaterial = await tx.material.update({
                where: { id: material.id },
                data: {
                    currentStock: {
                        increment: payload.quantity,
                    },
                },
            });

            return { purchase, currentStock: updatedMaterial.currentStock };
        });

        await this.activityLogger.log({
            actorId: user.id,
            action: "MATERIAL_PURCHASED",
            entityType: "MaterialPurchase",
            entityId: result.purchase.id,
            metadata: {
                materialName: material.name,
                quantity: payload.quantity,
                totalCost,
                newStock: result.currentStock,
            },
        });

        return {
            message: "Material purchase recorded and inventory updated",
            data: {
                id: result.purchase.id,
                currentStock: result.currentStock,
            },
        };
    }

    // CRITICAL BUSINESS RULE #6: MaterialUsage decrements Material.currentStock
    // Reject if quantityUsed > currentStock
    async createMaterialUsage(
        materialId: string,
        payload: CreateMaterialUsageDto,
        user: UserPayload,
    ) {
        const material = await this.prisma.material.findUnique({
            where: { id: materialId },
        });

        if (!material) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Material not found");
        }

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
                "You can only record material usage for projects you manage",
            );
        }

        const usageDate = payload.date ? new Date(payload.date) : new Date();
        const normalizedDate = new Date(
            Date.UTC(
                usageDate.getUTCFullYear(),
                usageDate.getUTCMonth(),
                usageDate.getUTCDate(),
            ),
        );

        const result = await this.prisma.$transaction(async (tx) => {
            const updatedCount = await tx.material.updateMany({
                where: {
                    id: material.id,
                    currentStock: { gte: payload.quantityUsed },
                },
                data: {
                    currentStock: { decrement: payload.quantityUsed },
                },
            });

            if (updatedCount.count !== 1) {
                throw new ApiError(
                    HttpStatus.BAD_REQUEST,
                    `Cannot log usage of ${payload.quantityUsed} ${material.unit}. Current stock is insufficient.`,
                );
            }

            const usage = await tx.materialUsage.create({
                data: {
                    materialId: material.id,
                    projectId: project.id,
                    quantityUsed: payload.quantityUsed,
                    date: normalizedDate,
                    notes: payload.notes ?? null,
                    recordedById: user.id,
                },
            });

            const updatedMaterial = await tx.material.findUnique({
                where: { id: material.id },
                select: { currentStock: true },
            });

            return {
                usage,
                remainingStock: updatedMaterial?.currentStock ?? 0,
            };
        });

        await this.activityLogger.log({
            projectId: project.id,
            actorId: user.id,
            action: "MATERIAL_USAGE_LOGGED",
            entityType: "MaterialUsage",
            entityId: result.usage.id,
            metadata: {
                materialName: material.name,
                quantityUsed: payload.quantityUsed,
                remainingStock: result.remainingStock,
            },
        });

        return {
            message: "Material usage recorded and stock deducted",
            data: {
                id: result.usage.id,
                remainingStock: result.remainingStock,
            },
        };
    }

    async createMaterialRequest(
        payload: CreateMaterialRequestDto,
        user: UserPayload,
    ) {
        const material = await this.prisma.material.findUnique({
            where: { id: payload.materialId },
        });

        if (!material) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Material not found");
        }

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
                "You can only request materials for projects you manage",
            );
        }

        const request = await this.prisma.materialRequest.create({
            data: {
                materialId: material.id,
                projectId: project.id,
                quantity: payload.quantity,
                requiredDate: payload.requiredDate
                    ? new Date(payload.requiredDate)
                    : null,
                reason: payload.reason ?? null,
                requestedById: user.id,
            },
        });

        await this.activityLogger.log({
            projectId: project.id,
            actorId: user.id,
            action: "MATERIAL_REQUESTED",
            entityType: "MaterialRequest",
            entityId: request.id,
            metadata: {
                materialName: material.name,
                quantity: payload.quantity,
            },
        });

        return {
            message: "Material request submitted successfully",
            data: { id: request.id },
        };
    }

    // CRITICAL BUSINESS RULE #6: MaterialRequest approval does NOT change stock — it's just a status change
    async reviewMaterialRequest(
        id: string,
        payload: ReviewMaterialRequestDto,
        user: UserPayload,
    ) {
        const request = await this.prisma.materialRequest.findUnique({
            where: { id },
            include: { material: true, project: true },
        });

        if (!request) {
            throw new ApiError(
                HttpStatus.NOT_FOUND,
                "Material request not found",
            );
        }

        if (
            user.role === UserRole.SITE_MANAGER &&
            request.project.managerId !== user.id
        ) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "Access denied to material request for this project",
            );
        }

        const updated = await this.prisma.materialRequest.update({
            where: { id },
            data: {
                status: payload.status,
                reviewedById: user.id,
                reviewNote: payload.reviewNote ?? undefined,
                fulfilledAt:
                    payload.status === "Fulfilled" ? new Date() : undefined,
            },
        });

        // Rule #7 ActivityLog
        await this.activityLogger.log({
            projectId: request.projectId,
            actorId: user.id,
            action: "MATERIAL_REQUEST_REVIEWED",
            entityType: "MaterialRequest",
            entityId: id,
            metadata: {
                status: payload.status,
                materialName: request.material.name,
                quantity: request.quantity,
            },
        });

        return {
            message: `Material request ${payload.status.toLowerCase()} successfully`,
            data: { id: updated.id, status: updated.status },
        };
    }

    async fetchAllMaterialRequests(
        query: Record<string, any>,
        user: UserPayload,
    ) {
        const scopedQuery = { ...query };
        let projectScope: Prisma.MaterialRequestWhereInput | undefined;

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
                    "Access denied to requests for this project",
                );
            }

            if (!scopedQuery.projectId) {
                projectScope = { projectId: { in: managedIds } };
            }
        }

        const queryBuilder = new QueryBuilder<
            typeof this.prisma.materialRequest,
            Prisma.$MaterialRequestPayload
        >(this.prisma.materialRequest, scopedQuery);

        const response = await queryBuilder
            .rawFilter(projectScope ?? {})
            .sort()
            .filter({ exacts: ["projectId", "materialId", "status"] })
            .paginate()
            .include({
                material: {
                    select: {
                        id: true,
                        name: true,
                        unit: true,
                        unitCost: true,
                    },
                },
                project: {
                    select: { id: true, projectName: true, projectCode: true },
                },
                requestedBy: {
                    select: { id: true, userName: true, email: true },
                },
            })
            .execute();

        const pagination = await queryBuilder.countTotal();

        return {
            message: "Material requests fetched successfully",
            data: response,
            pagination,
        };
    }
}
