import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
    IsArray,
    IsDateString,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
} from "class-validator";

export class CreateDailyReportDto {
    @ApiProperty({ description: "Project ID" })
    @IsString()
    @IsNotEmpty()
    projectId: string;

    @ApiProperty({ example: "2026-09-18", description: "Report date (YYYY-MM-DD)" })
    @IsDateString()
    @IsNotEmpty()
    date: string;

    @ApiPropertyOptional({ example: "Sunny, 32°C", description: "Weather conditions" })
    @IsOptional()
    @IsString()
    weather?: string;

    @ApiPropertyOptional({ example: 25, description: "Number of present workers" })
    @IsOptional()
    @IsInt()
    @Min(0)
    presentWorkers?: number;

    @ApiPropertyOptional({ example: 2, description: "Number of absent workers" })
    @IsOptional()
    @IsInt()
    @Min(0)
    absentWorkers?: number;

    @ApiPropertyOptional({ example: "Completed 2nd floor column reinforcement and formwork." })
    @IsOptional()
    @IsString()
    workCompleted?: string;

    @ApiPropertyOptional({ example: "Placing conduit pipes for electrical wiring." })
    @IsOptional()
    @IsString()
    workInProgress?: string;

    @ApiPropertyOptional({ example: "Delay in gravel delivery by 2 hours." })
    @IsOptional()
    @IsString()
    issues?: string;

    @ApiPropertyOptional({ example: "Heavy morning rain caused 1 hour delay." })
    @IsOptional()
    @IsString()
    delays?: string;

    @ApiPropertyOptional({ example: "All workers wearing helmets and safety boots. No incidents." })
    @IsOptional()
    @IsString()
    safetyNotes?: string;

    @ApiPropertyOptional({ type: [String], description: "Photo filenames or URLs" })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    photos?: string[];
}

export class UpdateDailyReportDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    weather?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(0)
    presentWorkers?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    @Min(0)
    absentWorkers?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    workCompleted?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    workInProgress?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    issues?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    delays?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    safetyNotes?: string;

    @ApiPropertyOptional({ type: [String] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    photos?: string[];
}
