import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  faculty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  bio?: string;
}

export class ChangePasswordDto {
  @IsNotEmpty()
  @IsString()
  currentPassword: string;

  @IsString()
  @IsNotEmpty()
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#()_\-+=])[A-Za-z\d@$!%*?&^#()_\-+=]{8,}$/,
    {
      message:
        'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.',
    },
  )
  newPassword: string;
}
