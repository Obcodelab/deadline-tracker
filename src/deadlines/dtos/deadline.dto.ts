import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DeadlineType, Priority } from '@prisma/client';
import type { DeadlineStatus } from './deadline-response.dto';
import { PaginationQueryDto } from '../../common/dtos/pagination-query.dto';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateDeadlineDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsEnum(DeadlineType)
  type: DeadlineType;

  @IsUUID()
  courseId: string;

  @IsDateString()
  dueDate: string;

  @Matches(TIME_REGEX, { message: 'dueTime must be in HH:mm 24-hour format.' })
  dueTime: string;

  @IsEnum(Priority)
  priority: Priority;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateChecklistItemDto)
  checklistItems?: CreateChecklistItemDto[];
}

export class UpdateDeadlineDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsEnum(DeadlineType)
  type?: DeadlineType;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @Matches(TIME_REGEX, { message: 'dueTime must be in HH:mm 24-hour format.' })
  dueTime?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

export class CreateChecklistItemDto {
  @IsString()
  @IsNotEmpty()
  text: string;
}

export class ToggleChecklistItemDto {
  @IsBoolean()
  isComplete: boolean;
}

export class ListDeadlinesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  course?: string;

  @IsOptional()
  @IsIn(['upcoming', 'due_today', 'overdue', 'completed'])
  status?: DeadlineStatus;

  @IsOptional()
  @IsEnum(DeadlineType)
  type?: DeadlineType;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  search?: string;
}
