import { PrismaService } from "@/core/services/prisma/prisma.service";
import { HttpStatus, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ApiError } from "@/common/errors/api_error";
import { BcryptService } from "@/common/utils/bcrypt.service";
import { generateOTP } from "./auth.utils";
import config from "@/config";
import {
    generateForgetPasswordTemplate,
    generateVerifyOTPTemplate,
} from "./auth.template";
import {
    AcceptInviteDto,
    ChangePasswordDto,
    ForgotPasswordDto,
    LoginUserDto,
    RefreshTokenDto,
    ResendOtpDto,
    ResetPasswordDto,
    VerifyOtpDto,
} from "./dto/body.dto";
import { UserPayload } from "@/common/guards/auth.guard";
import { sendEmail } from "@/core/services/email";
import { InviteStatus, UserRole, UserStatus } from "@prisma/client";

@Injectable()
export class AuthService {
    constructor(
        private jwtService: JwtService,
        private bcryptService: BcryptService,
        private prisma: PrismaService,
    ) {}

    async acceptInvite(payload: AcceptInviteDto) {
        const invite = await this.prisma.invite.findFirst({
            where: {
                token: payload.token,
            },
        });

        if (!invite) {
            throw new ApiError(HttpStatus.NOT_FOUND, "Invalid invite token");
        }

        if (invite.status === InviteStatus.Accepted) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "This invite has already been accepted",
            );
        }

        if (
            invite.status === InviteStatus.Cancelled ||
            invite.status === InviteStatus.Expired ||
            invite.expiresAt < new Date()
        ) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "This invite has expired or was cancelled",
            );
        }

        const existingUser = await this.prisma.user.findUnique({
            where: { email: invite.email },
        });

        if (existingUser) {
            throw new ApiError(
                HttpStatus.CONFLICT,
                "A user with this email already exists",
            );
        }

        const hashedPassword = await this.bcryptService.hash(
            payload.password,
            config.password.salt,
        );

        const result = await this.prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    userName: payload.userName,
                    email: invite.email,
                    password: hashedPassword,
                    role: invite.role,
                    status: UserStatus.ACTIVE,
                },
            });

            if (invite.role === UserRole.WORKER && invite.workerCategory) {
                await tx.workerProfile.create({
                    data: {
                        workerId: user.id,
                        workerCategory: invite.workerCategory,
                        phoneNumber: payload.phoneNumber ?? null,
                    },
                });
            }

            await tx.invite.update({
                where: { id: invite.id },
                data: { status: InviteStatus.Accepted },
            });

            return user;
        });

        const jwtPayload: UserPayload = {
            id: result.id,
            email: result.email,
            role: result.role,
        };

        const accessToken = this.jwtService.sign(jwtPayload, {
            secret: config.jwt.jwt_secret,
            expiresIn: config.jwt.jwt_secret_expires_in,
        });
        const refreshToken = this.jwtService.sign(jwtPayload, {
            secret: config.jwt.refresh_token_secret,
            expiresIn: config.jwt.refresh_token_expires_in,
        });

        return {
            message: "Invite accepted successfully",
            data: {
                accessToken,
                refreshToken,
                user: {
                    id: result.id,
                    email: result.email,
                    userName: result.userName,
                    role: result.role,
                },
            },
        };
    }

    async loginWithEmail(payload: LoginUserDto) {
        const userData = await this.prisma.user.findUnique({
            where: {
                email: payload.email,
            },
            include: {
                workerProfile: true,
            },
        });

        if (!userData) {
            throw new ApiError(HttpStatus.UNAUTHORIZED, "Invalid Credentials");
        }

        if (userData.status === UserStatus.DELETED) {
            throw new ApiError(HttpStatus.UNAUTHORIZED, "Invalid Credentials");
        }

        if (userData.status === UserStatus.BLOCKED) {
            throw new ApiError(
                HttpStatus.FORBIDDEN,
                "This account is blocked. Please contact an administrator.",
            );
        }

        const passwordMatched = await this.bcryptService.compare(
            payload.password,
            userData.password,
        );

        if (!passwordMatched) {
            throw new ApiError(HttpStatus.UNAUTHORIZED, "Invalid Credentials");
        }

        const jwtPayload: UserPayload = {
            id: userData.id,
            email: userData.email,
            role: userData.role,
        };

        const accessToken = this.jwtService.sign(jwtPayload, {
            secret: config.jwt.jwt_secret,
            expiresIn: config.jwt.jwt_secret_expires_in,
        });
        const refreshToken = this.jwtService.sign(jwtPayload, {
            secret: config.jwt.refresh_token_secret,
            expiresIn: config.jwt.refresh_token_expires_in,
        });

        return {
            message: "Login successful",
            data: {
                refreshToken,
                accessToken,
                user: {
                    id: userData.id,
                    email: userData.email,
                    userName: userData.userName,
                    role: userData.role,
                    status: userData.status,
                    workerProfile: userData.workerProfile,
                },
            },
        };
    }

    async sendOTP(payload: ResendOtpDto) {
        const userData = await this.prisma.user.findUnique({
            where: {
                email: payload.email,
            },
        });

        if (!userData) {
            throw new ApiError(HttpStatus.NOT_FOUND, "User not found");
        }

        const { otp, otpExpiry } = generateOTP();

        await this.prisma.otp.upsert({
            where: { email: payload.email },
            create: {
                email: payload.email,
                otpCode: otp,
                expiresAt: otpExpiry,
            },
            update: {
                otpCode: otp,
                expiresAt: otpExpiry,
            },
        });

        const html = generateVerifyOTPTemplate(otp);
        await sendEmail({
            email: userData.email,
            subject: `Verification Code - ${config.company_name}`,
            html,
        });

        return {
            message: "OTP sent successfully",
        };
    }

    async verifyOTP(payload: VerifyOtpDto) {
        const otpRecord = await this.prisma.otp.findUnique({
            where: {
                email: payload.email,
            },
        });

        if (!otpRecord) {
            throw new ApiError(HttpStatus.NOT_FOUND, "OTP request not found");
        }

        if (otpRecord.otpCode !== payload.otp) {
            throw new ApiError(HttpStatus.BAD_REQUEST, "Incorrect OTP");
        }

        if (otpRecord.expiresAt < new Date()) {
            throw new ApiError(HttpStatus.BAD_REQUEST, "OTP expired");
        }

        await this.prisma.otp.delete({
            where: { id: otpRecord.id },
        });

        return {
            message: "OTP verification successful",
        };
    }

    async forgotPassword(payload: ForgotPasswordDto) {
        const userData = await this.prisma.user.findUnique({
            where: {
                email: payload.email,
            },
        });

        if (!userData) {
            throw new ApiError(HttpStatus.NOT_FOUND, "User not found");
        }

        const jwtPayload = { email: userData.email, role: userData.role };
        const resetPassToken = this.jwtService.sign(jwtPayload, {
            secret: config.jwt.reset_token_secret,
            expiresIn: config.jwt.reset_token_expires_in,
        });

        const resetPassLink =
            config.url.reset_pass +
            `?userId=${userData.id}&token=${resetPassToken}`;

        const html = generateForgetPasswordTemplate(resetPassLink);
        await sendEmail({
            email: userData.email,
            subject: `Password Reset Request - ${config.company_name}`,
            html,
        });

        return {
            message: "Password reset instructions sent to email",
        };
    }

    async resetPassword(payload: ResetPasswordDto) {
        let decrypted: UserPayload | undefined;

        try {
            decrypted = this.jwtService.verify(payload.token, {
                secret: config.jwt.reset_token_secret,
            });
        } catch {
            throw new ApiError(HttpStatus.BAD_REQUEST, "Invalid or expired token");
        }

        const userData = await this.prisma.user.findUnique({
            where: {
                email: decrypted.email,
            },
        });

        if (!userData) {
            throw new ApiError(HttpStatus.NOT_FOUND, "User not found");
        }

        const password = await this.bcryptService.hash(
            payload.password,
            config.password.salt,
        );

        await this.prisma.user.update({
            where: {
                id: userData.id,
            },
            data: {
                password,
            },
        });

        return { message: "Password reset successful" };
    }

    async changePassword(payload: ChangePasswordDto, user: UserPayload) {
        const userData = await this.prisma.user.findUnique({
            where: { id: user.id },
        });

        if (!userData) {
            throw new ApiError(HttpStatus.NOT_FOUND, "User not found");
        }

        const passwordValid = await this.bcryptService.compare(
            payload.oldPassword,
            userData.password,
        );

        if (!passwordValid) {
            throw new ApiError(HttpStatus.UNAUTHORIZED, "Incorrect old password");
        }

        const hashedPassword = await this.bcryptService.hash(
            payload.newPassword,
            config.password.salt,
        );

        await this.prisma.user.update({
            where: {
                id: user.id,
            },
            data: {
                password: hashedPassword,
            },
        });

        return { message: "Password changed successfully" };
    }

    async refreshToken(payload: RefreshTokenDto) {
        if (!payload.refreshToken) {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "refreshToken is required",
            );
        }

        let decrypted: UserPayload | undefined;
        try {
            decrypted = this.jwtService.verify(payload.refreshToken, {
                secret: config.jwt.refresh_token_secret,
            });
        } catch {
            throw new ApiError(
                HttpStatus.BAD_REQUEST,
                "Refresh Token is Invalid or Expired",
            );
        }

        const userData = await this.prisma.user.findUnique({
            where: { id: decrypted.id },
        });

        if (!userData || userData.status !== UserStatus.ACTIVE) {
            throw new ApiError(
                HttpStatus.UNAUTHORIZED,
                "Unauthenticated Request",
            );
        }

        const jwtPayload: UserPayload = {
            id: userData.id,
            role: userData.role,
            email: userData.email,
        };

        const accessToken = this.jwtService.sign(jwtPayload, {
            secret: config.jwt.jwt_secret,
            expiresIn: config.jwt.jwt_secret_expires_in,
        });

        return {
            data: { accessToken },
            message: "Access Token generated",
        };
    }
}
