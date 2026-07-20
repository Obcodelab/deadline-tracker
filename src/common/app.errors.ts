import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from './app.exception';

export class AuthErrors {
  static userNotFound() {
    return new NotFoundException('User not found.', {
      code: 'USER_NOT_FOUND',
    });
  }

  static invalidCredentials() {
    return new UnauthorizedException('Invalid email or password.', {
      code: 'INVALID_CREDENTIALS',
    });
  }

  static unauthorized() {
    return new UnauthorizedException(
      'Authentication required or session expired.',
      {
        code: 'UNAUTHORIZED',
      },
    );
  }

  static invalidRefreshToken() {
    return new UnauthorizedException('Invalid or expired refresh token.', {
      code: 'INVALID_REFRESH_TOKEN',
    });
  }

  static emailAlreadyExists(email: string) {
    return new ConflictException('An account with this email already exists.', {
      code: 'EMAIL_ALREADY_EXISTS',
      detail: {
        field: 'emailAddress',
        value: email,
      },
    });
  }

  static emailAlreadyVerified(email: string) {
    return new BadRequestException('Email is already verified.', {
      code: 'EMAIL_ALREADY_VERIFIED',
      detail: {
        field: 'emailAddress',
        value: email,
      },
    });
  }

  static invalidOtp() {
    return new BadRequestException('Invalid email or verification code.', {
      code: 'INVALID_OTP',
    });
  }

  static expiredOtp() {
    return new BadRequestException('Verification code has expired.', {
      code: 'OTP_EXPIRED',
    });
  }

  static invalidToken() {
    return new BadRequestException('Invalid token', {
      code: 'INVALID_TOKEN',
      detail: {
        field: 'token',
      },
    });
  }

  static expiredToken() {
    return new BadRequestException('Reset token has expired', {
      code: 'EXPIRED_TOKEN',
      detail: {
        field: 'token',
      },
    });
  }

  static emailNotVerified() {
    return new UnauthorizedException(
      'Please verify your email before logging in.',
      {
        code: 'EMAIL_NOT_VERIFIED',
      },
    );
  }

  static samePassword() {
    return new BadRequestException(
      'New password cannot be the same as the old password',
      {
        code: 'INVALID_PASSWORD',
        detail: {
          field: 'password',
        },
      },
    );
  }

  static invalidPassword() {
    return new BadRequestException('Invalid password.', {
      code: 'INVALID_PASSWORD',
      detail: {
        field: 'password',
      },
    });
  }
}

export class UserErrors {
  static invalidPassword() {
    return new UnauthorizedException('Current password is incorrect.', {
      code: 'INVALID_PASSWORD',
    });
  }

  static passwordNotSet() {
    return new BadRequestException(
      'This account signed up with Google and has no password set.',
      {
        code: 'PASSWORD_NOT_SET',
      },
    );
  }
}
