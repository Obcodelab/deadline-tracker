import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { AcademicTerm } from '@prisma/client';

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;

export class CreateCourseDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsEnum(AcademicTerm)
  term: AcademicTerm;

  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'color must be a valid hex color.' })
  color: string;
}

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  code?: string;

  @IsOptional()
  @IsEnum(AcademicTerm)
  term?: AcademicTerm;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'color must be a valid hex color.' })
  color?: string;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class JoinCourseDto {
  @IsString()
  @IsNotEmpty()
  joinCode: string;
}
