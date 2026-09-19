import {
    Body,
    Controller,
    Delete,
    Get,
    HttpStatus,
    Param,
    Post,
    Req,
} from "@nestjs/common";
import { InviteService } from "./invite.service";
import { CreateInviteDto } from "./dto/body.dto";
import { ResponseService } from "@/common/interceptors/response";
import { Roles } from "@/common/decorators/roles.decorator";
import { UserRole } from "@prisma/client";
import { IsPublic } from "@/common/decorators/auth.decorator";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { UserPayload } from "@/common/guards/auth.guard";

@ApiTags("Invites")
@Controller("invites")
export class InviteController {
    constructor(private inviteService: InviteService) {}

    @Post()
    @Roles(UserRole.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: "Admin creates and sends user invite" })
    async createInvite(@Body() payload: CreateInviteDto, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.inviteService.createInvite(payload, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.CREATED,
            message: result.message,
            data: result.data,
        });
    }

    @Get()
    @Roles(UserRole.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: "Admin lists invites" })
    async fetchAllInvites(@Req() req: Request) {
        const query = req.query;
        const user = req.user as UserPayload;
        const result = await this.inviteService.fetchAllInvites(query, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
            pagination: result.pagination,
        });
    }

    @Get("verify/:token")
    @IsPublic()
    @ApiOperation({ summary: "Verify invite token validity (Public)" })
    async verifyInviteToken(@Param("token") token: string) {
        const result = await this.inviteService.verifyInviteToken(token);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Get(":id")
    @Roles(UserRole.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: "Admin fetches single invite details" })
    async fetchSingleInvite(@Param("id") id: string, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.inviteService.fetchSingleInvite(id, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @Delete(":id")
    @Roles(UserRole.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({ summary: "Admin cancels an invite" })
    async deleteInvite(@Param("id") id: string, @Req() req: Request) {
        const user = req.user as UserPayload;
        const result = await this.inviteService.deleteInvite(id, user);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }
}
