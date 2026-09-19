import {
    Body,
    Controller,
    Get,
    HttpStatus,
    Param,
    Post,
    Req,
} from "@nestjs/common";
import { ChatService } from "./chat.service";
import {
    CreateOrGetRoomDto,
    SendDirectMessageDto,
    SendProjectMessageDto,
} from "./dto/body.dto";
import { ResponseService } from "@/common/interceptors/response";
import { Roles } from "@/common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { UserPayload } from "@/common/guards/auth.guard";

@ApiTags("Chat")
@ApiBearerAuth()
@Controller("chat")
export class ChatController {
    constructor(private chatService: ChatService) {}

    // ─── 1:1 DM Rooms ────────────────────────────────────────────────────

    @Post("rooms")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "Find or create a 1:1 DM room between caller and receiverId" })
    async getOrCreateRoom(@Body() payload: CreateOrGetRoomDto, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.chatService.getOrCreateRoom(payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Get("rooms")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "List all 1:1 DM rooms for the current user with last-message preview" })
    async getRooms(@Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.chatService.getRooms(user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Get("rooms/:roomId/messages")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "Paginated messages for a 1:1 DM room (marks as read on fetch)" })
    async getRoomMessages(@Param("roomId") roomId: string, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.chatService.getRoomMessages(roomId, req.query, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
            pagination: result.pagination,
        });
    }

    @Post("rooms/:roomId/messages")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "Send a direct message in a 1:1 DM room" })
    async sendDirectMessage(
        @Param("roomId") roomId: string,
        @Body() payload: SendDirectMessageDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.chatService.sendDirectMessage(roomId, payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.CREATED,
            message: result.message,
            data: result.data,
        });
    }

    // ─── Project Group Chat ───────────────────────────────────────────────

    @Get("project-rooms/:projectId/messages")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "Paginated messages for a project group chat (scoped per Rule #1)" })
    async getProjectMessages(
        @Param("projectId") projectId: string,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.chatService.getProjectMessages(projectId, req.query, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
            pagination: result.pagination,
        });
    }

    @Post("project-rooms/:projectId/messages")
    @Roles(UserRole.ADMIN, UserRole.SITE_MANAGER, UserRole.WORKER)
    @ApiOperation({ summary: "Send a message in a project group chat (scoped per Rule #1)" })
    async sendProjectMessage(
        @Param("projectId") projectId: string,
        @Body() payload: SendProjectMessageDto,
        @Req() req: Request,
    ) {
        const user = req.user as UserPayload;
        const result = await this.chatService.sendProjectMessage(projectId, payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.CREATED,
            message: result.message,
            data: result.data,
        });
    }
}
