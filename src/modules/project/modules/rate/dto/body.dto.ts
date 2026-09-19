import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TWorkerCategory } from "@prisma/client";
import { IsEnum, IsInt, IsNotEmpty, IsOptional, Min } from "class-validator";

export class SetProjectWorkerRateDto {
    @ApiProperty({
        enum: TWorkerCategory,
        description: `Worker category: ${Object.values(TWorkerCategory).join(", ")}`,
        example: TWorkerCategory.Mason,
    })
    @IsEnum(TWorkerCategory)
    @IsNotEmpty()
    category: TWorkerCategory;

    @ApiProperty({ example: 1200, description: "Daily rate in currency units (e.g. BDT/USD cents)" })
    @IsInt()
    @Min(0)
    dailyRate: number;

    @ApiPropertyOptional({ example: 180, description: "Overtime hourly rate" })
    @IsOptional()
    @IsInt()
    @Min(0)
    overtimeRate?: number;
}
