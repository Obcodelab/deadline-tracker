import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import crypto from 'crypto';
import { plainToInstance } from 'class-transformer';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  ResendOtpDto,
  ResetPasswordDto,
  SignUpDto,
  VerifyOtpDto,
} from '../dtos/auth.dto';
import {
  LoginResponseDto,
  TokenPairResponseDto,
} from '../dtos/auth-response.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../../users/services/users.service';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { GoogleProfile } from '../interfaces/google-profile.interface';

import { AuthErrors } from '../../common/app.errors';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private async generate_otp(user: User) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        code,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    return code;
  }

  private async generateTokens(user: User) {
    const payload = {
      sub: user.id,
      emailAddress: user.emailAddress,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow('jwt.refreshSecret'),
      expiresIn: this.configService.getOrThrow('jwt.refreshExpiresIn'),
    });

    return { accessToken, refreshToken };
  }

  private generateResetToken() {
    return crypto.randomUUID();
  }

  private hashResetToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async refreshToken(dto: RefreshTokenDto) {
    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync(dto.refreshToken, {
        secret: this.configService.getOrThrow('jwt.refreshSecret'),
      });
    } catch {
      throw AuthErrors.invalidRefreshToken();
    }

    const user = await this.usersService.findByRefreshToken(payload.sub);

    if (!user) {
      throw AuthErrors.invalidRefreshToken();
    }

    if (!user.hashedRefreshToken) {
      throw AuthErrors.invalidRefreshToken();
    }

    const matches = await bcrypt.compare(
      dto.refreshToken,
      user.hashedRefreshToken,
    );

    if (!matches) {
      throw AuthErrors.invalidRefreshToken();
    }

    const tokens = await this.generateTokens(user);

    await this.usersService.updateRefreshToken(user.id, tokens.refreshToken);

    return plainToInstance(TokenPairResponseDto, tokens, {
      excludeExtraneousValues: true,
    });
  }

  async signup(dto: SignUpDto) {
    const existingUser = await this.usersService.findByEmail(dto.emailAddress);
    if (existingUser) {
      throw AuthErrors.emailAlreadyExists(dto.emailAddress);
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.usersService.create({
      ...dto,
      password: hashedPassword,
    });

    await this.prisma.verificationToken.deleteMany({
      where: { userId: user.id },
    });

    const code = await this.generate_otp(user);

    console.log(`
      ====================================
      EMAIL VERIFICATION CODE
      
      Email: ${user.emailAddress}
      Code : ${code}
      
      ====================================
    `);
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const user = await this.usersService.findByEmail(dto.emailAddress);

    if (!user) {
      throw AuthErrors.invalidOtp();
    }

    if (user.isEmailVerified) {
      throw AuthErrors.emailAlreadyVerified(dto.emailAddress);
    }

    const token = await this.prisma.verificationToken.findFirst({
      where: {
        userId: user.id,
        code: dto.code,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) {
      throw AuthErrors.invalidOtp();
    }

    if (token.expiresAt < new Date()) {
      throw AuthErrors.expiredOtp();
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
      },
    });

    await this.prisma.verificationToken.delete({
      where: {
        id: token.id,
      },
    });

    const tokens = await this.generateTokens(user);

    await this.usersService.updateRefreshToken(user.id, tokens.refreshToken);
    await this.usersService.updateLastLogin(user.id);

    return plainToInstance(
      LoginResponseDto,
      { id: user.id, fullName: user.fullName, ...tokens },
      { excludeExtraneousValues: true },
    );
  }

  async resendOtp(dto: ResendOtpDto) {
    const user = await this.usersService.findByEmail(dto.emailAddress);

    if (!user) {
      return;
    }

    const token = await this.prisma.verificationToken.findFirst({
      where: {
        userId: user.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) {
      throw AuthErrors.invalidOtp();
    }

    let code: string;
    if (token.expiresAt < new Date()) {
      await this.prisma.verificationToken.deleteMany({
        where: { userId: user.id },
      });
      code = await this.generate_otp(user);
    } else {
      code = token.code;
    }

    console.log(`
      ====================================
      EMAIL VERIFICATION CODE
      
      Email: ${user.emailAddress}
      Code : ${code}
      
      ====================================
    `);
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.emailAddress);
    if (!user) {
      return;
    }

    const token = this.generateResetToken();

    await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        passwordResetToken: this.hashResetToken(token),
        passwordResetExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const resetUrl = new URL(
      this.configService.getOrThrow<string>('app.frontendUrl'),
    );
    resetUrl.pathname = '/reset-password';
    resetUrl.searchParams.set('token', token);

    console.log(`
      =====================================
      PASSWORD RESET

      Email : ${user.emailAddress}

      ${resetUrl.toString()}

      =====================================
    `);
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.usersService.findByPasswordResetToken(
      this.hashResetToken(dto.token),
    );

    if (!user) {
      throw AuthErrors.invalidToken();
    }

    if (
      !user.passwordResetExpiresAt ||
      user.passwordResetExpiresAt < new Date()
    ) {
      throw AuthErrors.expiredToken();
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    if (user.password) {
      const compared = await bcrypt.compare(dto.password, user.password);

      if (compared) {
        throw AuthErrors.samePassword();
      }
    }

    await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
        hashedRefreshToken: null,
      },
    });
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.emailAddress);
    if (!user) {
      throw AuthErrors.invalidCredentials();
    }

    if (!user.isEmailVerified) {
      throw AuthErrors.emailNotVerified();
    }

    if (!user.password) {
      throw AuthErrors.invalidCredentials();
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw AuthErrors.invalidCredentials();
    }

    const tokens = await this.generateTokens(user);

    await this.usersService.updateRefreshToken(user.id, tokens.refreshToken);
    await this.usersService.updateLastLogin(user.id);

    return plainToInstance(
      LoginResponseDto,
      { id: user.id, fullName: user.fullName, ...tokens },
      { excludeExtraneousValues: true },
    );
  }

  async googleLogin(profile: GoogleProfile) {
    let user = await this.usersService.findByEmail(profile.emailAddress);

    if (!user) {
      user = await this.usersService.createGoogleUser(profile);
    } else if (!user.isEmailVerified) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { isEmailVerified: true },
      });
    }

    const tokens = await this.generateTokens(user);

    await this.usersService.updateRefreshToken(user.id, tokens.refreshToken);
    await this.usersService.updateLastLogin(user.id);

    return tokens;
  }
}
