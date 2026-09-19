import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TWorkerCategory, UserRole } from "@prisma/client";
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateInviteDto {
    @ApiProperty({ example: "worker@example.com", description: "Email to send invitation to" })
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @ApiProperty({
        enum: UserRole,
        description: `Roles: ${Object.values(UserRole).join(", ")}`,
        example: UserRole.WORKER,
    })
    @IsEnum(UserRole)
    role: UserRole;

    @ApiPropertyOptional({
        enum: TWorkerCategory,
        description: `Worker category (required if role is WORKER): ${Object.values(TWorkerCategory).join(", ")}`,
        example: TWorkerCategory.Mason,
    })
    @IsOptional()
    @IsEnum(TWorkerCategory)
    workerCategory?: TWorkerCategory;
}
