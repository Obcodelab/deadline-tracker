import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { DeadlineType } from '@prisma/client';

export class DashboardQueryDto {
  @IsOptional()
  @IsUUID()
  course?: string;

  @IsOptional()
  @IsEnum(DeadlineType)
  type?: DeadlineType;
}
