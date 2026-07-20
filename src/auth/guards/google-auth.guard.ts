import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthErrors } from '../../common/app.errors';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  handleRequest<TUser = any>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      throw AuthErrors.unauthorized();
    }

    return user;
  }
}
