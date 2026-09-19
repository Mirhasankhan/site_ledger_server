import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TApplyStatus } from "@prisma/client";
import {
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
} from "class-validator";

export class CreateLeaveDto {
    @ApiProperty({ description: "Worker User ID requesting leave" })
    @IsString()
    @IsNotEmpty()
    workerId: string;

    @ApiProperty({ description: "Project ID for the leave request" })
    @IsString()
    @IsNotEmpty()
    projectId: string;

    @ApiProperty({ example: "Annual leave" })
    @IsString()
    @IsNotEmpty()
    leaveType: string;

    @ApiProperty({ example: "2026-09-21" })
    @IsDateString()
    startDate: string;

    @ApiProperty({ example: "2026-09-23" })
    @IsDateString()
    endDate: string;

    @ApiProperty({ example: "Family event" })
    @IsString()
    @IsNotEmpty()
    reason: string;
}

export class ReviewLeaveDto {
    @ApiProperty({ enum: ["Accepted", "Rejected"], example: "Accepted" })
    @IsEnum(TApplyStatus)
    @IsNotEmpty()
    status: "Accepted" | "Rejected";

    @ApiPropertyOptional({ example: "Approved for the requested dates" })
    @IsOptional()
    @IsString()
    reviewNote?: string;
}
