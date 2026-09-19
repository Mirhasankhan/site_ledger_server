import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Post,
    Req,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { IsPublic } from "@/common/decorators/auth.decorator";
import { Request } from "express";
import { ResponseService } from "@/common/interceptors/response";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
    AcceptInviteDto,
    ChangePasswordDto,
    ForgotPasswordDto,
    LoginUserDto,
    ResendOtpDto,
    ResetPasswordDto,
    VerifyOtpDto,
} from "./dto/body.dto";
import { UserPayload } from "@/common/guards/auth.guard";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
    constructor(private authService: AuthService) {}

    @HttpCode(HttpStatus.OK)
    @IsPublic()
    @Post("accept-invite")
    @ApiOperation({ summary: "Accept Invite & Activate Account" })
    async acceptInvite(@Body() payload: AcceptInviteDto) {
        const result = await this.authService.acceptInvite(payload);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @IsPublic()
    @Post("login")
    @ApiOperation({ summary: "Login User" })
    async loginWithEmail(@Body() payload: LoginUserDto) {
        const result = await this.authService.loginWithEmail(payload);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
            data: result.data,
        });
    }

    @IsPublic()
    @Post("send-otp")
    @ApiOperation({ summary: "Resend OTP" })
    async resendOTP(@Body() payload: ResendOtpDto) {
        const result = await this.authService.sendOTP(payload);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
        });
    }

    @IsPublic()
    @Post("verify-otp")
    @ApiOperation({ summary: "Verify OTP" })
    async verifyOTP(@Body() payload: VerifyOtpDto) {
        const result = await this.authService.verifyOTP(payload);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
        });
    }

    @Post("change-password")
    @ApiOperation({ summary: "Change Password" })
    async changePassword(
        @Body() payload: ChangePasswordDto,
        @Req() req: Request,
    ) {
        const result = await this.authService.changePassword(
            payload,
            req.user as UserPayload,
        );

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
        });
    }

    @IsPublic()
    @Post("forgot-password")
    @ApiOperation({ summary: "Forgot Password" })
    async forgotPassword(@Body() payload: ForgotPasswordDto) {
        const result = await this.authService.forgotPassword(payload);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
        });
    }

    @IsPublic()
    @Post("reset-password")
    @ApiOperation({ summary: "Reset Password" })
    async resetPassword(@Body() payload: ResetPasswordDto) {
        const result = await this.authService.resetPassword(payload);

        return ResponseService.formatResponse({
            statusCode: HttpStatus.OK,
            message: result.message,
        });
    }
}
