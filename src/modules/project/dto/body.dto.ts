import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ProjectStatus } from "@prisma/client";
import {
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from "class-validator";

export class CreateProjectDto {
    @ApiProperty({
        example: "Metro Rail Phase 2",
        description: "Name of the project",
    })
    @IsString()
    @IsNotEmpty()
    projectName: string;

    @ApiPropertyOptional({
        example: "MRP-02",
        description: "Unique project code",
    })
    @IsOptional()
    @IsString()
    projectCode?: string;

    @ApiProperty({
        description:
            "ID of the User with SITE_MANAGER role assigned to this project",
    })
    @IsString()
    @IsNotEmpty()
    managerId: string;

    @ApiProperty({ example: "Sector 10, Uttara, Dhaka" })
    @IsString()
    @IsNotEmpty()
    address: string;

    @ApiProperty({
        example: "Construction of metro overpass and station infrastructure.",
    })
    @IsString()
    @IsNotEmpty()
    description: string;

    @ApiPropertyOptional({
        example: "metro_site.jpg",
        description: "Project banner or main photo URL",
    })
    @IsOptional()
    @IsString()
    projectImage?: string;

    @ApiPropertyOptional({
        example: 5000000,
        description: "Total project budget",
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    budget?: number;

    @ApiPropertyOptional({
        enum: ProjectStatus,
        description: `Status: ${Object.values(ProjectStatus).join(", ")}`,
        default: ProjectStatus.Ongoing,
    })
    @IsOptional()
    @IsEnum(ProjectStatus)
    status?: ProjectStatus;

    @ApiPropertyOptional({
        example: 8,
        default: 8,
        description: "Standard work hours per day",
    })
    @IsOptional()
    @IsNumber()
    @Min(1)
    standardWorkHours?: number;

    @ApiPropertyOptional({ example: "2026-03-01T00:00:00.000Z" })
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @ApiPropertyOptional({ example: "2027-12-31T00:00:00.000Z" })
    @IsOptional()
    @IsDateString()
    endDate?: string;
}

export class UpdateProjectDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    projectName?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    projectCode?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    managerId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    address?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    projectImage?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0)
    budget?: number;

    @ApiPropertyOptional({ enum: ProjectStatus })
    @IsOptional()
    @IsEnum(ProjectStatus)
    status?: ProjectStatus;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(1)
    standardWorkHours?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    endDate?: string;
}
