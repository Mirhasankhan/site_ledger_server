import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/services/prisma/prisma.service";
import { Prisma } from "@prisma/client";

export interface LogActionParams {
    projectId?: string | null;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, any>;
    systemMessage?: string;
    tx?: Prisma.TransactionClient;
}

@Injectable()
export class ActivityLoggerService {
    constructor(private prisma: PrismaService) {}

    async log(params: LogActionParams) {
        const client = params.tx ?? this.prisma;

        const logEntry = await client.activityLog.create({
            data: {
                projectId: params.projectId ?? null,
                actorId: params.actorId,
                action: params.action,
                entityType: params.entityType,
                entityId: params.entityId,
                metadata: params.metadata ?? undefined,
            },
        });

        if (params.projectId && params.systemMessage) {
            let projectRoom = await client.projectRoom.findFirst({
                where: { projectId: params.projectId },
            });

            if (!projectRoom) {
                projectRoom = await client.projectRoom.create({
                    data: { projectId: params.projectId },
                });
            }

            await client.projectMessage.create({
                data: {
                    projectRoomId: projectRoom.id,
                    authorId: null,
                    isSystem: true,
                    content: params.systemMessage,
                    fileUrl: [],
                },
            });
        }

        return logEntry;
    }
}
