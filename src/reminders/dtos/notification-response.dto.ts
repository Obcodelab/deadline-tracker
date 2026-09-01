import { Exclude, Expose, Type } from 'class-transformer';
import { DeadlineCourseSummaryDto } from '../../deadlines/dtos/deadline-response.dto';

@Exclude()
export class NotificationDeadlineDto {
  @Expose()
  id: string;

  @Expose()
  title: string;

  @Expose()
  dueDate: string;

  @Expose()
  dueTime: string;

  @Expose()
  @Type(() => DeadlineCourseSummaryDto)
  course: DeadlineCourseSummaryDto;
}

@Exclude()
export class NotificationResponseDto {
  @Expose()
  id: string;

  @Expose()
  offsetMinutes: number;

  @Expose()
  sentAt: Date;

  @Expose()
  isRead: boolean;

  @Expose()
  @Type(() => NotificationDeadlineDto)
  deadline: NotificationDeadlineDto;
}
