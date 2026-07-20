import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiError } from './app.interface';

interface HttpExceptionResponseBody {
  message?: string;
  error?: ApiError;
}

@Catch(HttpException)
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();

    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal Server Error';
    let error: ApiError = {
      code: 'INTERNAL_SERVER_ERROR',
    };

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();

      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const res = exceptionResponse as HttpExceptionResponseBody;

        message = res.message ?? message;
        error = res.error ?? error;
      } else {
        message = exceptionResponse;
      }
    }

    response.status(statusCode).json({
      status: 'error',
      message,
      data: null,
      error,
    });
  }
}
