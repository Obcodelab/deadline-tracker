import { Exclude, Expose } from 'class-transformer';

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
  createdAt: Date;
}
