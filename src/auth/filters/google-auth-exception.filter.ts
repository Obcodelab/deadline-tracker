import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

@Catch(HttpException)
export class GoogleAuthExceptionFilter implements ExceptionFilter {
  constructor(private readonly configService: ConfigService) {}

  catch(_exception: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    const redirectUrl = new URL(
      this.configService.getOrThrow<string>('app.frontendUrl'),
    );
    redirectUrl.searchParams.set('error', 'google_auth_failed');

    response.redirect(redirectUrl.toString());
  }
}
