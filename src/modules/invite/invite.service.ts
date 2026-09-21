import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "@/core/services/prisma/prisma.service";
import { CreateInviteDto } from "./dto/body.dto";
import { UserPayload } from "@/common/guards/auth.guard";
import { ApiError } from "@/common/errors/api_error";
import { InviteStatus, Prisma, UserRole } from "@prisma/client";
import { randomBytes } from "crypto";
import QueryBuilder from "@/common/utils/queryBuilder";
import { ActivityLoggerService } from "@/core/services/activity/activity_logger.service";
import { sendEmail } from "@/core/services/email";
import config from "@/config";
import {
    generateInviteEmailHtml,
    generateInviteEmailText,
} from "./invite.template";

@Injectable()
export class InviteService {
    constructor(
        private prisma: PrismaService,
        private activityLogger: ActivityLoggerService,
    ) {}

    async createInvite(payload: CreateInviteDto, user: UserPayload) {
        if (payload.role === UserRole.WORKER && !payload.workerCategory) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "Worker category is required when inviting a Worker",
            );
        }

        const existingUser = await this.prisma.user.findUnique({
            where: { email: payload.email },
        });

        if (existingUser) {
            throw new ApiError(
                HttpStatus.CONFLICT,
                "A user with this email already exists",
            );
        }

        const existingPendingInvite = await this.prisma.invite.findFirst({
            where: {
                email: payload.email,
                status: InviteStatus.Pending,
                expiresAt: { gt: new Date() },
            },
        });

        if (existingPendingInvite) {
            throw new ApiError(
                HttpStatus.CONFLICT,
                "An active invite is already pending for this email",
            );
        }

        const token = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        const invite = await this.prisma.invite.create({
            data: {
                email: payload.email,
                role: payload.role,
                workerCategory: payload.workerCategory ?? null,
                token,
                status: InviteStatus.Pending,
                expiresAt,
            },
        });

        await this.activityLogger.log({
            actorId: user.id,
            action: "INVITE_CREATED",
            entityType: "Invite",
            entityId: invite.id,
            metadata: {
                invitedEmail: invite.email,
                role: invite.role,
                workerCategory: invite.workerCategory,
            },
        });

        const companyName = config.company_name || "Siteledger";
        const frontendUrl = config.url.frontend || "http://localhost:3000";
        const inviteLink = `${frontendUrl}/accept-invite?token=${token}`;
        const formattedRole =
            payload.role === UserRole.SITE_MANAGER
                ? "Site Manager"
                : payload.role === UserRole.WORKER
                  ? "Worker"
                  : "Admin";

        const emailHtml = generateInviteEmailHtml({
            email: invite.email,
            role: formattedRole,
            workerCategory: payload.workerCategory,
            inviteLink,
        });

        const emailText = generateInviteEmailText({
            email: invite.email,
            role: formattedRole,
            workerCategory: payload.workerCategory,
            inviteLink,
        });

        try {
            await sendEmail({
                email: invite.email,
                subject: `Invitation to join ${companyName} as ${formattedRole}`,
                html: emailHtml,
                text: emailText,
            });
        } catch (emailError) {
            console.error("Failed to send invitation email:", emailError);
            throw new ApiError(
                HttpStatus.INTERNAL_SERVER_ERROR,
                `Invitation created but failed to send email to ${invite.email}: ${(emailError as Error).message}`,
            );
        }

        return {
            message: `Invitation email sent successfully to ${invite.email}`,
            data: {
                id: invite.id,
                email: invite.email,
                role: invite.role,
                workerCategory: invite.workerCategory,
                expiresAt: invite.expiresAt,
            },
        };
    }

    async fetchAllInvites(query: Record<string, any>, user: UserPayload) {
        const queryBuilder = new QueryBuilder<
            typeof this.prisma.invite,
            Prisma.$InvitePayload
        >(this.prisma.invite, query);

        const response = await queryBuilder
            .search(["email"])
            .sort()
            .filter({ exacts: ["status", "role", "workerCategory"] })
            .paginate()
            .execute();

        const pagination = await queryBuilder.countTotal();

        return {
            message: "Invites fetched successfully",
            data: response,
            pagination,
        };
    }

    async fetchSingleInvite(id: string, user: UserPayload) {
        const invite = await this.prisma.invite.findUnique({
            where: { id },
        });

        if (!invite) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Invite not found");
        }

        return {
            message: "Invite fetched successfully",
            data: invite,
        };
    }

    async verifyInviteToken(token: string) {
        const invite = await this.prisma.invite.findFirst({
            where: { token },
        });

        if (!invite) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Invalid invite token");
        }

        if (invite.status === InviteStatus.Accepted) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "Invite has already been accepted",
            );
        }

        if (
            invite.status === InviteStatus.Cancelled ||
            invite.status === InviteStatus.Expired ||
            invite.expiresAt < new Date()
        ) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "Invite has expired or was cancelled",
            );
        }

        return {
            message: "Invite token verified",
            data: {
                email: invite.email,
                name: null,
                role: invite.role,
                workerCategory: invite.workerCategory,
                expiresAt: invite.expiresAt,
            },
        };
    }

    async deleteInvite(id: string, user: UserPayload) {
        const invite = await this.prisma.invite.findUnique({
            where: { id },
        });

        if (!invite) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Invite not found");
        }

        await this.prisma.invite.update({
            where: { id },
            data: { status: InviteStatus.Cancelled },
        });

        await this.activityLogger.log({
            actorId: user.id,
            action: "INVITE_CANCELLED",
            entityType: "Invite",
            entityId: id,
            metadata: { email: invite.email },
        });

        return {
            message: "Invite cancelled successfully",
            data: { id },
        };
    }
}
