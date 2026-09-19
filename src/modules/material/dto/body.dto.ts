import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
    MaterialCategory,
    MaterialRequestStatus,
    MaterialUnit,
} from "@prisma/client";
import {
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsPositive,
    IsString,
    Min,
} from "class-validator";

export class CreateMaterialDto {
    @ApiProperty({ example: "Portland Cement 50kg", description: "Material item name" })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        enum: MaterialCategory,
        description: `Category: ${Object.values(MaterialCategory).join(", ")}`,
        example: MaterialCategory.Cement,
    })
    @IsEnum(MaterialCategory)
    @IsNotEmpty()
    category: MaterialCategory;

    @ApiProperty({
        enum: MaterialUnit,
        description: `Measurement unit: ${Object.values(MaterialUnit).join(", ")}`,
        example: MaterialUnit.Bag,
    })
    @IsEnum(MaterialUnit)
    @IsNotEmpty()
    unit: MaterialUnit;

    @ApiProperty({ example: 550, description: "Standard unit cost" })
    @IsNumber()
    @IsPositive()
    unitCost: number;

    @ApiPropertyOptional({ example: 50, description: "Minimum inventory threshold for alerts" })
    @IsOptional()
    @IsNumber()
    @Min(0)
    minimumStock?: number;

    @ApiPropertyOptional({ example: "Holcim Bangladesh Ltd." })
    @IsOptional()
    @IsString()
    supplier?: string;

    @ApiPropertyOptional({ example: "Warehouse Sector 4" })
    @IsOptional()
    @IsString()
    location?: string;
}

export class UpdateMaterialDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ enum: MaterialCategory })
    @IsOptional()
    @IsEnum(MaterialCategory)
    category?: MaterialCategory;

    @ApiPropertyOptional({ enum: MaterialUnit })
    @IsOptional()
    @IsEnum(MaterialUnit)
    unit?: MaterialUnit;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @IsPositive()
    unitCost?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0)
    minimumStock?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    supplier?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    location?: string;
}

export class CreateMaterialPurchaseDto {
    @ApiProperty({ example: 100, description: "Quantity purchased" })
    @IsNumber()
    @IsPositive()
    quantity: number;

    @ApiProperty({ example: 540, description: "Unit purchase price" })
    @IsNumber()
    @IsPositive()
    unitCost: number;

    @ApiPropertyOptional({ example: "Holcim Cement Depot" })
    @IsOptional()
    @IsString()
    supplier?: string;

    @ApiPropertyOptional({ example: "2026-09-18T10:00:00.000Z" })
    @IsOptional()
    @IsDateString()
    date?: string;
}

export class CreateMaterialUsageDto {
    @ApiProperty({ description: "Project ID where materials are consumed" })
    @IsString()
    @IsNotEmpty()
    projectId: string;

    @ApiProperty({ example: 25, description: "Quantity consumed (must not exceed currentStock)" })
    @IsNumber()
    @IsPositive()
    quantityUsed: number;

    @ApiPropertyOptional({ example: "2026-09-18" })
    @IsOptional()
    @IsDateString()
    date?: string;

    @ApiPropertyOptional({ example: "Used for 3rd floor column casting" })
    @IsOptional()
    @IsString()
    notes?: string;
}

export class CreateMaterialRequestDto {
    @ApiProperty({ description: "Material ID" })
    @IsString()
    @IsNotEmpty()
    materialId: string;

    @ApiProperty({ description: "Project ID" })
    @IsString()
    @IsNotEmpty()
    projectId: string;

    @ApiProperty({ example: 50, description: "Quantity requested" })
    @IsNumber()
    @IsPositive()
    quantity: number;

    @ApiPropertyOptional({ example: "2026-09-22T08:00:00.000Z" })
    @IsOptional()
    @IsDateString()
    requiredDate?: string;

    @ApiPropertyOptional({ example: "Needed for rooftop waterproofing" })
    @IsOptional()
    @IsString()
    reason?: string;
}

export class ReviewMaterialRequestDto {
    @ApiProperty({
        enum: MaterialRequestStatus,
        description: `Status: ${Object.values(MaterialRequestStatus).join(", ")}`,
        example: MaterialRequestStatus.Approved,
    })
    @IsEnum(MaterialRequestStatus)
    @IsNotEmpty()
    status: MaterialRequestStatus;

    @ApiPropertyOptional({ example: "Approved. Vendor delivery arranged for Tuesday." })
    @IsOptional()
    @IsString()
    reviewNote?: string;
}
