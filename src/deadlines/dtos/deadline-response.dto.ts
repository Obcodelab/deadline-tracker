import { Exclude, Expose, Type } from 'class-transformer';
import { DeadlineType, Priority } from '@prisma/client';

export type DeadlineStatus = 'upcoming' | 'due_today' | 'overdue' | 'completed';

@Exclude()
export class ChecklistItemResponseDto {
  @Expose()
  id: string;

  @Expose()
  text: string;

  @Expose()
  isComplete: boolean;

  @Expose()
  order: number;
}

@Exclude()
export class DeadlineProgressDto {
  @Expose()
  completed: number;

  @Expose()
  total: number;
}

@Exclude()
export class DeadlineCourseSummaryDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  code: string;

  @Expose()
  color: string;
}

@Exclude()
export class DeadlineResponseDto {
  @Expose()
  id: string;

  @Expose()
  title: string;

  @Expose()
  type: DeadlineType;

  @Expose()
  @Type(() => DeadlineCourseSummaryDto)
  course: DeadlineCourseSummaryDto;

  @Expose()
  dueDate: string;

  @Expose()
  dueTime: string;

  @Expose()
  priority: Priority;

  @Expose()
  description: string | null;

  @Expose()
  status: DeadlineStatus;

  @Expose()
  @Type(() => DeadlineProgressDto)
  progress: DeadlineProgressDto;

  @Expose()
  @Type(() => ChecklistItemResponseDto)
  checklistItems: ChecklistItemResponseDto[];

  @Expose()
  createdById: string;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}

@Exclude()
export class DeadlineListItemResponseDto {
  @Expose()
  id: string;

  @Expose()
  title: string;

  @Expose()
  type: DeadlineType;

  @Expose()
  @Type(() => DeadlineCourseSummaryDto)
  course: DeadlineCourseSummaryDto;

  @Expose()
  dueDate: string;

  @Expose()
  dueTime: string;

  @Expose()
  priority: Priority;

  @Expose()
  status: DeadlineStatus;

  @Expose()
  @Type(() => DeadlineProgressDto)
  progress: DeadlineProgressDto;
}

@Exclude()
export class ChecklistToggleResponseDto {
  @Expose()
  @Type(() => ChecklistItemResponseDto)
  item: ChecklistItemResponseDto;

  @Expose()
  @Type(() => DeadlineProgressDto)
  progress: DeadlineProgressDto;
}
