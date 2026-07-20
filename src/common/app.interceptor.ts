import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SUCCESS_MESSAGE } from './app.decorator';
import { ApiResponse } from './app.interface';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const message =
      this.reflector.get<string>(SUCCESS_MESSAGE, context.getHandler()) ??
      'Request successful.';

    return next.handle().pipe(
      map((data: T) => ({
        status: 'success' as const,
        message,
        data,
        error: null,
      })),
    );
  }
}
