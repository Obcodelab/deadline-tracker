import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { OAuthProvider, User } from '@prisma/client';
import { ChangePasswordDto, UpdateProfileDto } from '../dtos/user.dto';
import { AuthErrors, UserErrors } from '../../common/app.errors';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateRefreshToken(userId: string, refreshToken: string) {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken },
    });
  }

  async clearRefreshToken(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken: null },
    });
  }

  async updateLastLogin(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  async findByEmail(emailAddress: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { emailAddress },
    });
  }

  async findByPasswordResetToken(token: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { passwordResetToken: token },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        emailAddress: true,
        department: true,
        faculty: true,
        isEmailVerified: true,
        createdAt: true,
      },
    });
  }

  async findByRefreshToken(userId: string) {
    return this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        fullName: true,
        emailAddress: true,
        department: true,
        faculty: true,
      },
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw AuthErrors.userNotFound();
    }

    if (!user.password) {
      throw UserErrors.passwordNotSet();
    }

    const isPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );

    if (!isPasswordValid) {
      throw UserErrors.invalidPassword();
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        password: hashedPassword,
      },
    });

    return null;
  }

  async create(data: {
    fullName: string;
    emailAddress: string;
    password: string;
  }): Promise<User> {
    const existingUser = await this.findByEmail(data.emailAddress);

    if (existingUser) {
      throw AuthErrors.emailAlreadyExists(data.emailAddress);
    }
    return this.prisma.user.create({
      data: {
        ...data,
        oauthProvider: OAuthProvider.EMAIL,
      },
    });
  }

  async createGoogleUser(data: {
    fullName?: string;
    emailAddress: string;
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        emailAddress: data.emailAddress,
        fullName: data.fullName ?? data.emailAddress.split('@')[0],
        oauthProvider: OAuthProvider.GOOGLE,
        isEmailVerified: true,
      },
    });
  }

  async logout(userId: string) {
    await this.clearRefreshToken(userId);

    return null;
  }
}
