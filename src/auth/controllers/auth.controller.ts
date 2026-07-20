import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  ResendOtpDto,
  ResetPasswordDto,
  SignUpDto,
  VerifyOtpDto,
} from '../dtos/auth.dto';
import { AuthService } from '../services/auth.service';
import { SuccessMessage } from '../../common/app.decorator';
import { GoogleAuthGuard } from '../guards/google-auth.guard';
import type { GoogleProfile } from '../interfaces/google-profile.interface';
import { GoogleAuthExceptionFilter } from '../filters/google-auth-exception.filter';

const SENSITIVE_AUTH_THROTTLE = { default: { limit: 5, ttl: 60000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('google/login')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {}

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @UseFilters(GoogleAuthExceptionFilter)
  async googleAuthCallback(@Req() req: Request, @Res() res: Response) {
    const tokens = await this.authService.googleLogin(
      req.user as GoogleProfile,
    );

    const redirectUrl = new URL(
      this.configService.getOrThrow<string>('app.frontendUrl'),
    );
    redirectUrl.searchParams.set('accessToken', tokens.accessToken);
    redirectUrl.searchParams.set('refreshToken', tokens.refreshToken);

    res.redirect(redirectUrl.toString());
  }

  @Post('signup')
  @Throttle(SENSITIVE_AUTH_THROTTLE)
  @SuccessMessage('Verification code sent successfully.')
  signup(@Body() dto: SignUpDto) {
    return this.authService.signup(dto);
  }

  @Post('verify-otp')
  @Throttle(SENSITIVE_AUTH_THROTTLE)
  @SuccessMessage('Email verified successfully.')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('resend-otp')
  @Throttle(SENSITIVE_AUTH_THROTTLE)
  @SuccessMessage('Verification code sent successfully.')
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto);
  }

  @Post('forgot-password')
  @Throttle(SENSITIVE_AUTH_THROTTLE)
  @SuccessMessage('Reset link sent successfully.')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle(SENSITIVE_AUTH_THROTTLE)
  @SuccessMessage('Password reset successfully.')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('refresh-token')
  @SuccessMessage('Token refreshed successfully.')
  refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  @Post('login')
  @Throttle(SENSITIVE_AUTH_THROTTLE)
  @SuccessMessage('Login successfully.')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
