import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { JwtUser } from '../auth/interfaces/jwt-payload.interface';

type AuthenticatedRequest = Request & { user: JwtUser };

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);

export const SUCCESS_MESSAGE = 'success';
export const SuccessMessage = (message: string) => {
  return SetMetadata(SUCCESS_MESSAGE, message);
};
