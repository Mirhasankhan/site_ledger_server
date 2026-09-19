import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TApplyStatus, TWorkerCategory } from "@prisma/client";
import {
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsPositive,
    IsString,
    Min,
} from "class-validator";

export class AssignWorkerDto {
    @ApiProperty({ description: "Target Project ID to assign the worker to" })
    @IsString()
    @IsNotEmpty()
    projectId: string;

    @ApiPropertyOptional({
        description:
            "Optional custom daily rate override (otherwise snapshots active project rate)",
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    overrideDailyRate?: number;
}

export class UpdateWorkerDto {
    @ApiPropertyOptional({
        enum: TWorkerCategory,
        description: `Worker Category: ${Object.values(TWorkerCategory).join(", ")}`,
    })
    @IsOptional()
    @IsEnum(TWorkerCategory)
    workerCategory?: TWorkerCategory;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    phoneNumber?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    presentAddress?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    permanentAddress?: string;
}

export class CreateWithdrawDto {
    @ApiProperty({
        example: 2000,
        description: "Withdrawal amount requested (positive integer)",
    })
    @IsInt()
    @IsPositive()
    amount: number;
}

export class ReviewWithdrawDto {
    @ApiProperty({
        enum: ["Accepted", "Rejected"],
        description: "Accept or Reject the withdrawal request",
        example: "Accepted",
    })
    @IsEnum(TApplyStatus)
    @IsNotEmpty()
    status: "Accepted" | "Rejected";

    @ApiPropertyOptional({ example: "Approved for September payout" })
    @IsOptional()
    @IsString()
    note?: string;
}
