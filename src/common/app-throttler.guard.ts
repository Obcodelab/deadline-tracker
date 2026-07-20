import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CommonErrors } from './app.errors';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected throwThrottlingException(): Promise<void> {
    throw CommonErrors.tooManyRequests();
  }
}
