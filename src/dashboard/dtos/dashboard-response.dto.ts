import { Exclude, Expose, Type } from 'class-transformer';
import { DeadlineType, Priority } from '@prisma/client';
import { DeadlineProgressDto } from '../../deadlines/dtos/deadline-response.dto';

@Exclude()
export class DashboardCourseDto {
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
export class DashboardItemDto {
  @Expose()
  id: string;

  @Expose()
  title: string;

  @Expose()
  type: DeadlineType;

  @Expose()
  @Type(() => DashboardCourseDto)
  course: DashboardCourseDto;

  @Expose()
  dueDate: string;

  @Expose()
  dueTime: string;

  @Expose()
  priority: Priority;

  @Expose()
  @Type(() => DeadlineProgressDto)
  progress: DeadlineProgressDto;
}

@Exclude()
export class DashboardResponseDto {
  @Expose()
  @Type(() => DashboardItemDto)
  overdue: DashboardItemDto[];

  @Expose()
  @Type(() => DashboardItemDto)
  today: DashboardItemDto[];

  @Expose()
  @Type(() => DashboardItemDto)
  thisWeek: DashboardItemDto[];

  @Expose()
  @Type(() => DashboardItemDto)
  later: DashboardItemDto[];
}
