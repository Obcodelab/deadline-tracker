import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CommonErrors } from './app.errors';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  // Rate limiting protects production from abuse; it has no place gating a
  // test suite that legitimately signs up dozens of users per run.
  canActivate(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV === 'test') {
      return Promise.resolve(true);
    }
    return super.canActivate(context);
  }

  protected throwThrottlingException(): Promise<void> {
    throw CommonErrors.tooManyRequests();
  }
}
