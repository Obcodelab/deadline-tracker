import { Exclude, Expose } from 'class-transformer';
import { AcademicTerm, CourseRole } from '@prisma/client';

@Exclude()
export class CourseResponseDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  code: string;

  @Expose()
  term: AcademicTerm;

  @Expose()
  color: string;

  @Expose()
  joinCode: string;

  @Expose()
  archived: boolean;

  @Expose()
  ownerId: string;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}

@Exclude()
export class CourseMembershipResponseDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  code: string;

  @Expose()
  term: AcademicTerm;

  @Expose()
  color: string;

  @Expose()
  joinCode: string;

  @Expose()
  archived: boolean;

  @Expose()
  role: CourseRole;

  @Expose()
  memberCount: number;

  @Expose()
  deadlineCount: number;
}

@Exclude()
export class CourseMemberResponseDto {
  @Expose()
  id: string;

  @Expose()
  fullName: string;

  @Expose()
  emailAddress?: string;

  @Expose()
  role: CourseRole;

  @Expose()
  joinedAt: Date;
}
