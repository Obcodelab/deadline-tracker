import { Exclude, Expose } from 'class-transformer';
import { ReminderChannel } from '@prisma/client';

@Exclude()
export class UserProfileResponseDto {
  @Expose()
  id: string;

  @Expose()
  fullName: string;

  @Expose()
  emailAddress: string;

  @Expose()
  department: string | null;

  @Expose()
  faculty: string | null;

  @Expose()
  bio: string | null;

  @Expose()
  isEmailVerified: boolean;

  @Expose()
  reminderChannels: ReminderChannel[];

  @Expose()
  createdAt: Date;
}
