import { ApiProperty } from "@nestjs/swagger";
import {
    IsEmail,
    IsNotEmpty,
    IsOptional,
    IsString,
    MinLength,
} from "class-validator";

export class LoginUserDto {
    @ApiProperty({
        example: "admin@example.com",
        description: "User email address",
    })
    @IsEmail()
    email: string;

    @ApiProperty({ example: "123456", description: "User password" })
    @IsString()
    @IsNotEmpty()
    password: string;
}

export class AcceptInviteDto {
    @ApiProperty({ description: "Invite token received by email" })
    @IsString()
    @IsNotEmpty()
    token: string;

    @ApiProperty({
        example: "Rahim Ahmed",
        description:
            "Optional user full name; email local-part is used when omitted",
        required: false,
    })
    @IsString()
    @IsOptional()
    userName?: string;

    @ApiProperty({
        example: "password123",
        description: "Set new password",
        minLength: 6,
    })
    @IsString()
    @MinLength(6)
    password: string;

    @ApiProperty({
        example: "01712345678",
        required: false,
        description: "Phone number (optional)",
    })
    @IsString()
    @IsOptional()
    phoneNumber?: string;
}

export class ResetPasswordDto {
    @ApiProperty({ description: "Reset token" })
    @IsString()
    @IsNotEmpty()
    token: string;

    @ApiProperty({ minLength: 6 })
    @IsString()
    @MinLength(6)
    password: string;
}

export class ChangePasswordDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    oldPassword: string;

    @ApiProperty({ minLength: 6 })
    @IsString()
    @MinLength(6)
    newPassword: string;
}

export class ForgotPasswordDto {
    @ApiProperty({ example: "user@example.com" })
    @IsEmail()
    email: string;
}

export class VerifyOtpDto {
    @ApiProperty({ example: "123456" })
    @IsString()
    @IsNotEmpty()
    otp: string;

    @ApiProperty({ example: "user@example.com" })
    @IsEmail()
    email: string;
}

export class ResendOtpDto {
    @ApiProperty({ example: "user@example.com" })
    @IsEmail()
    email: string;
}
