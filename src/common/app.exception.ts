import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiError } from './app.interface';

export class AppException extends HttpException {
  constructor(status: HttpStatus, message: string, error: ApiError) {
    super(
      {
        message,
        error,
      },
      status,
    );
  }
}

export class NotFoundException extends AppException {
  constructor(message: string, error: ApiError) {
    super(HttpStatus.NOT_FOUND, message, error);
  }
}
export class BadRequestException extends AppException {
  constructor(message: string, error: ApiError) {
    super(HttpStatus.BAD_REQUEST, message, error);
  }
}
export class UnauthorizedException extends AppException {
  constructor(message: string, error: ApiError) {
    super(HttpStatus.UNAUTHORIZED, message, error);
  }
}
export class ConflictException extends AppException {
  constructor(message: string, error: ApiError) {
    super(HttpStatus.CONFLICT, message, error);
  }
}
export class ForbiddenException extends AppException {
  constructor(message: string, error: ApiError) {
    super(HttpStatus.FORBIDDEN, message, error);
  }
}
