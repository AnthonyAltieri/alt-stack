import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export enum TaskStatusDto {
  Todo = "todo",
  InProgress = "in_progress",
  Completed = "completed",
}

export enum TaskPriorityDto {
  Low = "low",
  Medium = "medium",
  High = "high",
}

export class ListTasksQueryDto {
  @IsOptional()
  @IsEnum(TaskStatusDto)
  status?: TaskStatusDto;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(TaskPriorityDto)
  priority!: TaskPriorityDto;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(TaskPriorityDto)
  priority?: TaskPriorityDto;

  @IsOptional()
  @IsEnum(TaskStatusDto)
  status?: TaskStatusDto;
}

export class AssignTaskDto {
  @IsString()
  @MinLength(1)
  assigneeId!: string;
}
