import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ExpenseCategory, ExpenseStatus } from "@prisma/client";
import {
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsPositive,
    IsString,
} from "class-validator";

export class CreateExpenseDto {
    @ApiProperty({ description: "Project ID" })
    @IsString()
    @IsNotEmpty()
    projectId: string;

    @ApiProperty({ example: "Cement delivery transport fee", description: "Expense title" })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({
        enum: ExpenseCategory,
        description: `Category: ${Object.values(ExpenseCategory).join(", ")}`,
        example: ExpenseCategory.Transportation,
    })
    @IsEnum(ExpenseCategory)
    @IsNotEmpty()
    category: ExpenseCategory;

    @ApiProperty({ example: 4500, description: "Expense amount" })
    @IsNumber()
    @IsPositive()
    amount: number;

    @ApiPropertyOptional({ example: "2026-09-18T10:00:00.000Z" })
    @IsOptional()
    @IsDateString()
    date?: string;

    @ApiPropertyOptional({ example: "Dhaka Transport Agency" })
    @IsOptional()
    @IsString()
    vendor?: string;

    @ApiPropertyOptional({ example: "INV-99201" })
    @IsOptional()
    @IsString()
    reference?: string;

    @ApiPropertyOptional({ example: "receipt_99201.jpg" })
    @IsOptional()
    @IsString()
    receiptUrl?: string;

    @ApiPropertyOptional({ example: "Delivered 200 bags of cement to Sector 10 site" })
    @IsOptional()
    @IsString()
    notes?: string;
}

export class UpdateExpenseDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    title?: string;

    @ApiPropertyOptional({ enum: ExpenseCategory })
    @IsOptional()
    @IsEnum(ExpenseCategory)
    category?: ExpenseCategory;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @IsPositive()
    amount?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    date?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    vendor?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    reference?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    receiptUrl?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    notes?: string;
}

export class ReviewExpenseDto {
    @ApiProperty({
        enum: ExpenseStatus,
        description: `Status to transition to: Approved, Rejected, or Paid`,
        example: ExpenseStatus.Approved,
    })
    @IsEnum(ExpenseStatus)
    @IsNotEmpty()
    status: ExpenseStatus;

    @ApiPropertyOptional({ example: "Approved per project invoice verification." })
    @IsOptional()
    @IsString()
    notes?: string;
}
