import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class TokenPairResponseDto {
  @Expose()
  accessToken: string;

  @Expose()
  refreshToken: string;
}

@Exclude()
export class LoginResponseDto {
  @Expose()
  id: string;

  @Expose()
  fullName: string;

  @Expose()
  accessToken: string;

  @Expose()
  refreshToken: string;
}
