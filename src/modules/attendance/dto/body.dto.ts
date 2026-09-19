import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AttendanceStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
    IsArray,
    IsDateString,
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from "class-validator";

export class MarkAttendanceDto {
    @ApiProperty({ description: "Worker ID (WorkerProfile ID or User ID)" })
    @IsString()
    @IsNotEmpty()
    workerId: string;

    @ApiProperty({ description: "Project ID" })
    @IsString()
    @IsNotEmpty()
    projectId: string;

    @ApiProperty({ example: "2026-09-18", description: "Date of attendance (YYYY-MM-DD)" })
    @IsDateString()
    @IsNotEmpty()
    date: string;

    @ApiProperty({
        enum: AttendanceStatus,
        description: `Status: ${Object.values(AttendanceStatus).join(", ")}`,
        example: AttendanceStatus.Present,
    })
    @IsEnum(AttendanceStatus)
    status: AttendanceStatus;

    @ApiPropertyOptional({ example: "2026-09-18T08:00:00.000Z" })
    @IsOptional()
    @IsDateString()
    checkIn?: string;

    @ApiPropertyOptional({ example: "2026-09-18T17:00:00.000Z" })
    @IsOptional()
    @IsDateString()
    checkOut?: string;

    @ApiPropertyOptional({ example: 8 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    workingHours?: number;

    @ApiPropertyOptional({ example: 2 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    overtimeHours?: number;

    @ApiPropertyOptional({ description: "Required if status is Half_Day" })
    @IsOptional()
    @IsString()
    notes?: string;
}

export class BulkMarkAttendanceItemDto {
    @ApiProperty({ description: "Worker ID" })
    @IsString()
    @IsNotEmpty()
    workerId: string;

    @ApiProperty({ enum: AttendanceStatus, example: AttendanceStatus.Present })
    @IsEnum(AttendanceStatus)
    status: AttendanceStatus;

    @ApiPropertyOptional({ example: "Left after lunch for medical reason" })
    @IsOptional()
    @IsString()
    notes?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    checkIn?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    checkOut?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0)
    overtimeHours?: number;
}

export class BulkMarkAttendanceDto {
    @ApiProperty({ description: "Project ID" })
    @IsString()
    @IsNotEmpty()
    projectId: string;

    @ApiProperty({ example: "2026-09-18" })
    @IsDateString()
    @IsNotEmpty()
    date: string;

    @ApiProperty({ type: [BulkMarkAttendanceItemDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BulkMarkAttendanceItemDto)
    attendances: BulkMarkAttendanceItemDto[];
}

export class SelfCheckInDto {
    @ApiPropertyOptional({ description: "Optional project ID if worker is assigned to multiple" })
    @IsOptional()
    @IsString()
    projectId?: string;

    @ApiPropertyOptional({ example: "2026-09-18", description: "Attendance date (defaults to today)" })
    @IsOptional()
    @IsDateString()
    date?: string;

    @ApiPropertyOptional({ example: "2026-09-18T08:15:00.000Z" })
    @IsOptional()
    @IsDateString()
    checkIn?: string;

    @ApiPropertyOptional({ example: "2026-09-18T17:30:00.000Z" })
    @IsOptional()
    @IsDateString()
    checkOut?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    notes?: string;
}

export class VerifyAttendanceDto {
    @ApiProperty({
        enum: AttendanceStatus,
        description: `Authoritative status: ${Object.values(AttendanceStatus).join(", ")}`,
        example: AttendanceStatus.Present,
    })
    @IsEnum(AttendanceStatus)
    status: AttendanceStatus;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    checkIn?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    checkOut?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0)
    workingHours?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0)
    overtimeHours?: number;

    @ApiPropertyOptional({ description: "Required if status is Half_Day" })
    @IsOptional()
    @IsString()
    notes?: string;
}
