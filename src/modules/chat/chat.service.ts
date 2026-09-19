import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/services/prisma/prisma.service";
import {
    CreateOrGetRoomDto,
    SendDirectMessageDto,
    SendProjectMessageDto,
} from "./dto/body.dto";
import { UserPayload } from "@/common/guards/auth.guard";
import { ApiError } from "@/common/errors/api_error";
import { UserRole } from "@prisma/client";

@Injectable()
export class ChatService {
    constructor(private prisma: PrismaService) {}

    // ─── 1:1 Direct Message Rooms ─────────────────────────────────────────

    async getOrCreateRoom(payload: CreateOrGetRoomDto, user: UserPayload) {
        const receiver = await this.prisma.user.findUnique({
            where: { id: payload.receiverId },
            select: { id: true, userName: true, profileImage: true, role: true },
        });

        if (!receiver) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Receiver not found");
        }

        if (receiver.id === user.id) {
            throw new ApiError(HttpStatus.BAD_REQUEST, "Cannot create a chat room with yourself");
        }

        // Find existing room (senderId & receiverId can be in either order)
        const existingRoom = await this.prisma.room.findFirst({
            where: {
                OR: [
                    { senderId: user.id, receiverId: payload.receiverId },
                    { senderId: payload.receiverId, receiverId: user.id },
                ],
            },
            include: {
                user1: { select: { id: true, userName: true, profileImage: true } },
                user2: { select: { id: true, userName: true, profileImage: true } },
            },
        });

        if (existingRoom) {
            return {
                message: "Room fetched successfully",
                data: existingRoom,
            };
        }

        const newRoom = await this.prisma.room.create({
            data: {
                senderId: user.id,
                receiverId: payload.receiverId,
            },
            include: {
                user1: { select: { id: true, userName: true, profileImage: true } },
                user2: { select: { id: true, userName: true, profileImage: true } },
            },
        });

        return {
            message: "Room created successfully",
            data: newRoom,
        };
    }

    async getRooms(user: UserPayload) {
        const rooms = await this.prisma.room.findMany({
            where: {
                OR: [{ senderId: user.id }, { receiverId: user.id }],
            },
            include: {
                user1: { select: { id: true, userName: true, profileImage: true } },
                user2: { select: { id: true, userName: true, profileImage: true } },
                message: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: {
                        id: true,
                        content: true,
                        createdAt: true,
                        user1Read: true,
                        user2Read: true,
                    },
                },
            },
            orderBy: { updatedAt: "desc" },
        });

        // Add unread count hint per room
        const enriched = rooms.map((room) => {
            const lastMsg = (room.message as any[])[0] ?? null;
            const isUser1 = room.senderId === user.id;
            const hasUnread = lastMsg
                ? isUser1
                    ? !lastMsg.user1Read
                    : !lastMsg.user2Read
                : false;

            return { ...room, lastMessage: lastMsg, hasUnread };
        });

        return {
            message: "Rooms fetched successfully",
            data: enriched,
        };
    }

    async getRoomMessages(
        roomId: string,
        query: Record<string, any>,
        user: UserPayload,
    ) {
        const room = await this.prisma.room.findUnique({ where: { id: roomId } });

        if (!room) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Room not found");
        }

        if (room.senderId !== user.id && room.receiverId !== user.id) {
            throw new ApiError(HttpStatus.FORBIDDEN, "Access denied to this room");
        }

        const page = parseInt(query.page ?? "1", 10);
        const limit = parseInt(query.limit ?? "30", 10);
        const skip = (page - 1) * limit;

        const [messages, total] = await Promise.all([
            this.prisma.message.findMany({
                where: { roomId },
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
            }),
            this.prisma.message.count({ where: { roomId } }),
        ]);

        // Mark messages as read for this user
        const isUser1 = room.senderId === user.id;
        if (isUser1) {
            await this.prisma.message.updateMany({
                where: { roomId, user1Read: false },
                data: { user1Read: true },
            });
        } else {
            await this.prisma.message.updateMany({
                where: { roomId, user2Read: false },
                data: { user2Read: true },
            });
        }

        return {
            message: "Messages fetched successfully",
            data: messages.reverse(), // oldest first
            pagination: {
                page,
                limit,
                total,
                totalPage: Math.ceil(total / limit),
            },
        };
    }

    async sendDirectMessage(
        roomId: string,
        payload: SendDirectMessageDto,
        user: UserPayload,
    ) {
        const room = await this.prisma.room.findUnique({ where: { id: roomId } });

        if (!room) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Room not found");
        }

        if (room.senderId !== user.id && room.receiverId !== user.id) {
            throw new ApiError(HttpStatus.FORBIDDEN, "Access denied to this room");
        }

        if (!payload.content && (!payload.fileUrl || payload.fileUrl.length === 0)) {
            throw new ApiError(HttpStatus.BAD_REQUEST, "Message must have content or at least one file");
        }

        const isUser1 = room.senderId === user.id;

        const message = await this.prisma.message.create({
            data: {
                roomId,
                user1Id: room.senderId ?? user.id,
                user2Id: room.receiverId ?? user.id,
                content: payload.content ?? null,
                fileUrl: payload.fileUrl ?? [],
                user1Read: isUser1,  // sender has already read it
                user2Read: !isUser1,
            },
        });

        // Update room updatedAt for ordering
        await this.prisma.room.update({
            where: { id: roomId },
            data: { updatedAt: new Date() },
        });

        return {
            message: "Message sent successfully",
            data: message,
        };
    }

    // ─── Project Group Chat ───────────────────────────────────────────────

    async getProjectMessages(
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

        // Rule #1 scoping
        if (user.role === UserRole.SITE_MANAGER && project.managerId !== user.id) {
            throw new ApiError(HttpStatus.FORBIDDEN, "Access denied to this project's chat");
        }

        if (user.role === UserRole.WORKER) {
            const workerProfile = await this.prisma.workerProfile.findUnique({
                where: { workerId: user.id },
            });
            if (workerProfile?.projectId !== projectId) {
                throw new ApiError(HttpStatus.FORBIDDEN, "Access denied to this project's chat");
            }
        }

        const projectRoom = await this.prisma.projectRoom.findFirst({
            where: { projectId },
        });

        if (!projectRoom) {
            return {
                message: "Project messages fetched successfully",
                data: [],
                pagination: { page: 1, limit: 30, total: 0, totalPage: 0 },
            };
        }

        const page = parseInt(query.page ?? "1", 10);
        const limit = parseInt(query.limit ?? "30", 10);
        const skip = (page - 1) * limit;

        const [messages, total] = await Promise.all([
            this.prisma.projectMessage.findMany({
                where: { projectRoomId: projectRoom.id },
                orderBy: { createdAt: "desc" },
                skip,
                take: limit,
                include: {
                    projectRoom: { select: { projectId: true } },
                },
            }),
            this.prisma.projectMessage.count({
                where: { projectRoomId: projectRoom.id },
            }),
        ]);

        // Enrich with author details manually (authorId can be null for system messages)
        const authorIds = [...new Set(messages.filter((m) => m.authorId).map((m) => m.authorId as string))];
        const authors = authorIds.length
            ? await this.prisma.user.findMany({
                  where: { id: { in: authorIds } },
                  select: { id: true, userName: true, profileImage: true },
              })
            : [];

        const authorMap = new Map(authors.map((a) => [a.id, a]));

        const enriched = messages.reverse().map((msg) => ({
            ...msg,
            author: msg.authorId ? (authorMap.get(msg.authorId) ?? null) : null,
        }));

        return {
            message: "Project messages fetched successfully",
            data: enriched,
            pagination: {
                page,
                limit,
                total,
                totalPage: Math.ceil(total / limit),
            },
        };
    }

    async sendProjectMessage(
        projectId: string,
        payload: SendProjectMessageDto,
        user: UserPayload,
    ) {
        const project = await this.prisma.project.findUnique({
            where: { id: projectId },
        });

        if (!project) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Project not found");
        }

        // Rule #1 scoping
        if (user.role === UserRole.SITE_MANAGER && project.managerId !== user.id) {
            throw new ApiError(HttpStatus.FORBIDDEN, "Access denied to this project's chat");
        }

        if (user.role === UserRole.WORKER) {
            const workerProfile = await this.prisma.workerProfile.findUnique({
                where: { workerId: user.id },
            });
            if (workerProfile?.projectId !== projectId) {
                throw new ApiError(HttpStatus.FORBIDDEN, "Access denied to this project's chat");
            }
        }

        if (!payload.content && (!payload.fileUrl || payload.fileUrl.length === 0)) {
            throw new ApiError(HttpStatus.BAD_REQUEST, "Message must have content or at least one file");
        }

        // Find or create project room
        let projectRoom = await this.prisma.projectRoom.findFirst({
            where: { projectId },
        });

        if (!projectRoom) {
            projectRoom = await this.prisma.projectRoom.create({
                data: { projectId },
            });
        }

        const message = await this.prisma.projectMessage.create({
            data: {
                projectRoomId: projectRoom.id,
                authorId: user.id,
                content: payload.content ?? "",
                fileUrl: payload.fileUrl ?? [],
                isSystem: false,
            },
        });

        return {
            message: "Message sent successfully",
            data: message,
        };
    }
}
