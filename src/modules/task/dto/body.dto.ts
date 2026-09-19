import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TaskPriority, TaskStatus } from "@prisma/client";
import {
    IsArray,
    IsDateString,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    Min,
} from "class-validator";

export class CreateTaskDto {
    @ApiProperty({ description: "Project ID" })
    @IsString()
    @IsNotEmpty()
    projectId: string;

    @ApiProperty({ example: "Pour 3rd floor concrete slab", description: "Task title" })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiPropertyOptional({ example: "Ensure rebar inspection passes before pouring concrete." })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({
        enum: TaskPriority,
        description: `Priority: ${Object.values(TaskPriority).join(", ")}`,
        default: TaskPriority.Medium,
    })
    @IsOptional()
    @IsEnum(TaskPriority)
    priority?: TaskPriority;

    @ApiPropertyOptional({
        enum: TaskStatus,
        description: `Status: ${Object.values(TaskStatus).join(", ")}`,
        default: TaskStatus.To_Do,
    })
    @IsOptional()
    @IsEnum(TaskStatus)
    status?: TaskStatus;

    @ApiPropertyOptional({ example: 0, minimum: 0, maximum: 100, description: "Progress percentage" })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    progress?: number;

    @ApiPropertyOptional({ example: "2026-09-20T08:00:00.000Z" })
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @ApiPropertyOptional({ example: "2026-09-25T18:00:00.000Z" })
    @IsOptional()
    @IsDateString()
    dueDate?: string;

    @ApiPropertyOptional({ type: [String], description: "List of Worker IDs to assign" })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    assignedWorkerIds?: string[];
}

export class UpdateTaskDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    title?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ enum: TaskPriority })
    @IsOptional()
    @IsEnum(TaskPriority)
    priority?: TaskPriority;

    @ApiPropertyOptional({ enum: TaskStatus })
    @IsOptional()
    @IsEnum(TaskStatus)
    status?: TaskStatus;

    @ApiPropertyOptional({ minimum: 0, maximum: 100 })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    progress?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    dueDate?: string;
}

export class AssignTaskWorkerDto {
    @ApiProperty({ description: "Worker ID (WorkerProfile ID or User ID)" })
    @IsString()
    @IsNotEmpty()
    workerId: string;
}

export class CreateTaskCommentDto {
    @ApiProperty({ example: "Rebar inspected and approved by structural engineer." })
    @IsString()
    @IsNotEmpty()
    content: string;
}
