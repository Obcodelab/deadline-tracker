import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { OAuthProvider, User } from '@prisma/client';
import { AuthService } from './auth.service';
import { UsersService } from '../../users/services/users.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createMockPrismaService,
  MockPrismaService,
} from '../../test/support/mock-prisma';

jest.mock('bcrypt');

const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

function buildUser(overrides: Partial<User> = {}): User {
  return {
    pkid: 1,
    id: 'user-1',
    emailAddress: 'student@example.com',
    password: 'hashed-password',
    fullName: 'Ada Lovelace',
    department: null,
    faculty: null,
    bio: null,
    isEmailVerified: true,
    oauthProvider: OAuthProvider.EMAIL,
    lastLoginAt: null,
    passwordResetToken: null,
    passwordResetExpiresAt: null,
    hashedRefreshToken: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: MockPrismaService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            findByPasswordResetToken: jest.fn(),
            findByRefreshToken: jest.fn(),
            create: jest.fn(),
            createGoogleUser: jest.fn(),
            updateRefreshToken: jest.fn(),
            updateLastLogin: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn(), verifyAsync: jest.fn() },
        },
        { provide: ConfigService, useValue: { getOrThrow: jest.fn() } },
      ],
    }).compile();

    service = module.get(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);

    jwtService.signAsync.mockImplementation((_payload, options) =>
      Promise.resolve(options ? 'refresh-token' : 'access-token'),
    );

    const configValues: Record<string, string> = {
      'jwt.refreshSecret': 'refresh-secret',
      'jwt.refreshExpiresIn': '7d',
      'app.frontendUrl': 'https://app.example.com',
    };
    configService.getOrThrow.mockImplementation(
      (key: string) => configValues[key],
    );

    mockedBcrypt.hash.mockResolvedValue('hashed-password' as never);
    mockedBcrypt.compare.mockResolvedValue(true as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('signup', () => {
    it('throws when the email is already registered', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser());

      await expect(
        service.signup({
          fullName: 'Ada',
          emailAddress: 'student@example.com',
          password: 'Password1!',
        }),
      ).rejects.toMatchObject({
        response: { error: { code: 'EMAIL_ALREADY_EXISTS' } },
      });

      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('hashes the password, creates the user, and issues an OTP', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      const newUser = buildUser({ isEmailVerified: false });
      usersService.create.mockResolvedValue(newUser);
      prisma.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.verificationToken.create.mockResolvedValue({});

      await service.signup({
        fullName: 'Ada',
        emailAddress: 'student@example.com',
        password: 'Password1!',
      });

      expect(mockedBcrypt.hash).toHaveBeenCalledWith('Password1!', 12);
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ password: 'hashed-password' }),
      );
      expect(prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: newUser.id },
      });
      expect(prisma.verificationToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: newUser.id }),
        }),
      );
    });
  });

  describe('verifyOtp', () => {
    const dto = { emailAddress: 'student@example.com', code: '123456' };

    it('throws invalidOtp when the user does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(service.verifyOtp(dto)).rejects.toMatchObject({
        response: { error: { code: 'INVALID_OTP' } },
      });
    });

    it('throws emailAlreadyVerified when already verified', async () => {
      usersService.findByEmail.mockResolvedValue(
        buildUser({ isEmailVerified: true }),
      );

      await expect(service.verifyOtp(dto)).rejects.toMatchObject({
        response: { error: { code: 'EMAIL_ALREADY_VERIFIED' } },
      });
    });

    it('throws invalidOtp when no token matches', async () => {
      usersService.findByEmail.mockResolvedValue(
        buildUser({ isEmailVerified: false }),
      );
      prisma.verificationToken.findFirst.mockResolvedValue(null);

      await expect(service.verifyOtp(dto)).rejects.toMatchObject({
        response: { error: { code: 'INVALID_OTP' } },
      });
    });

    it('throws expiredOtp when the token has expired', async () => {
      usersService.findByEmail.mockResolvedValue(
        buildUser({ isEmailVerified: false }),
      );
      prisma.verificationToken.findFirst.mockResolvedValue({
        id: 'token-1',
        code: '123456',
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.verifyOtp(dto)).rejects.toMatchObject({
        response: { error: { code: 'OTP_EXPIRED' } },
      });
    });

    it('marks the user verified, consumes the token, and returns tokens', async () => {
      const user = buildUser({ isEmailVerified: false });
      usersService.findByEmail.mockResolvedValue(user);
      prisma.verificationToken.findFirst.mockResolvedValue({
        id: 'token-1',
        code: '123456',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      prisma.user.update.mockResolvedValue({
        ...user,
        isEmailVerified: true,
      });
      prisma.verificationToken.delete.mockResolvedValue({});

      const result = await service.verifyOtp(dto);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { isEmailVerified: true },
      });
      expect(prisma.verificationToken.delete).toHaveBeenCalledWith({
        where: { id: 'token-1' },
      });
      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(
        user.id,
        'refresh-token',
      );
      expect(usersService.updateLastLogin).toHaveBeenCalledWith(user.id);
      expect(result).toMatchObject({
        id: user.id,
        fullName: user.fullName,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });
  });

  describe('resendOtp', () => {
    it('silently no-ops when the user does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.resendOtp({ emailAddress: 'nobody@example.com' }),
      ).resolves.toBeUndefined();
      expect(prisma.verificationToken.findFirst).not.toHaveBeenCalled();
    });

    it('throws invalidOtp when the user has no outstanding token', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser());
      prisma.verificationToken.findFirst.mockResolvedValue(null);

      await expect(
        service.resendOtp({ emailAddress: 'student@example.com' }),
      ).rejects.toMatchObject({ response: { error: { code: 'INVALID_OTP' } } });
    });

    it('reuses the existing code when it has not expired', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser());
      prisma.verificationToken.findFirst.mockResolvedValue({
        id: 'token-1',
        code: '654321',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      await service.resendOtp({ emailAddress: 'student@example.com' });

      expect(prisma.verificationToken.deleteMany).not.toHaveBeenCalled();
      expect(prisma.verificationToken.create).not.toHaveBeenCalled();
    });

    it('generates a fresh code when the existing one has expired', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser());
      prisma.verificationToken.findFirst.mockResolvedValue({
        id: 'token-1',
        code: '654321',
        expiresAt: new Date(Date.now() - 1000),
      });
      prisma.verificationToken.deleteMany.mockResolvedValue({ count: 1 });
      prisma.verificationToken.create.mockResolvedValue({});

      await service.resendOtp({ emailAddress: 'student@example.com' });

      expect(prisma.verificationToken.deleteMany).toHaveBeenCalled();
      expect(prisma.verificationToken.create).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const dto = { emailAddress: 'student@example.com', password: 'Password1!' };

    it('throws invalidCredentials when the user does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toMatchObject({
        response: { error: { code: 'INVALID_CREDENTIALS' } },
      });
    });

    it('throws emailNotVerified when the account is unverified', async () => {
      usersService.findByEmail.mockResolvedValue(
        buildUser({ isEmailVerified: false }),
      );

      await expect(service.login(dto)).rejects.toMatchObject({
        response: { error: { code: 'EMAIL_NOT_VERIFIED' } },
      });
    });

    it('throws invalidCredentials for a Google-only account with no password', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser({ password: null }));

      await expect(service.login(dto)).rejects.toMatchObject({
        response: { error: { code: 'INVALID_CREDENTIALS' } },
      });
    });

    it('throws invalidCredentials when the password does not match', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser());
      mockedBcrypt.compare.mockResolvedValue(false as never);

      await expect(service.login(dto)).rejects.toMatchObject({
        response: { error: { code: 'INVALID_CREDENTIALS' } },
      });
    });

    it('returns tokens on success and records the login', async () => {
      const user = buildUser();
      usersService.findByEmail.mockResolvedValue(user);

      const result = await service.login(dto);

      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(
        user.id,
        'refresh-token',
      );
      expect(usersService.updateLastLogin).toHaveBeenCalledWith(user.id);
      expect(result).toMatchObject({
        id: user.id,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });
  });

  describe('refreshToken', () => {
    const dto = { refreshToken: 'a-refresh-token' };

    it('throws invalidRefreshToken when verification fails', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('bad token'));

      await expect(service.refreshToken(dto)).rejects.toMatchObject({
        response: { error: { code: 'INVALID_REFRESH_TOKEN' } },
      });
    });

    it('throws invalidRefreshToken when the user cannot be found', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      usersService.findByRefreshToken.mockResolvedValue(null);

      await expect(service.refreshToken(dto)).rejects.toMatchObject({
        response: { error: { code: 'INVALID_REFRESH_TOKEN' } },
      });
    });

    it('throws invalidRefreshToken when the user has no stored refresh token', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      usersService.findByRefreshToken.mockResolvedValue(
        buildUser({ hashedRefreshToken: null }),
      );

      await expect(service.refreshToken(dto)).rejects.toMatchObject({
        response: { error: { code: 'INVALID_REFRESH_TOKEN' } },
      });
    });

    it('throws invalidRefreshToken when the token does not match the hash', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      usersService.findByRefreshToken.mockResolvedValue(
        buildUser({ hashedRefreshToken: 'stored-hash' }),
      );
      mockedBcrypt.compare.mockResolvedValue(false as never);

      await expect(service.refreshToken(dto)).rejects.toMatchObject({
        response: { error: { code: 'INVALID_REFRESH_TOKEN' } },
      });
    });

    it('rotates the refresh token on success', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      const user = buildUser({ hashedRefreshToken: 'stored-hash' });
      usersService.findByRefreshToken.mockResolvedValue(user);

      const result = await service.refreshToken(dto);

      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(
        user.id,
        'refresh-token',
      );
      expect(result).toMatchObject({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });
  });

  describe('forgotPassword', () => {
    it('silently no-ops when the user does not exist', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await service.forgotPassword({ emailAddress: 'nobody@example.com' });

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('stores a hashed reset token with an expiry for an existing user', async () => {
      const user = buildUser();
      usersService.findByEmail.mockResolvedValue(user);
      prisma.user.update.mockResolvedValue(user);

      await service.forgotPassword({ emailAddress: user.emailAddress });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: expect.objectContaining({
          passwordResetToken: expect.any(String),
          passwordResetExpiresAt: expect.any(Date),
        }),
      });
    });
  });

  describe('resetPassword', () => {
    const dto = { token: 'reset-token', password: 'NewPassword1!' };

    it('throws invalidToken when no user matches the token', async () => {
      usersService.findByPasswordResetToken.mockResolvedValue(null);

      await expect(service.resetPassword(dto)).rejects.toMatchObject({
        response: { error: { code: 'INVALID_TOKEN' } },
      });
    });

    it('throws expiredToken when the reset window has passed', async () => {
      usersService.findByPasswordResetToken.mockResolvedValue(
        buildUser({ passwordResetExpiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.resetPassword(dto)).rejects.toMatchObject({
        response: { error: { code: 'EXPIRED_TOKEN' } },
      });
    });

    it('throws samePassword when reusing the current password', async () => {
      usersService.findByPasswordResetToken.mockResolvedValue(
        buildUser({
          passwordResetExpiresAt: new Date(Date.now() + 60_000),
        }),
      );
      mockedBcrypt.compare.mockResolvedValue(true as never);

      await expect(service.resetPassword(dto)).rejects.toMatchObject({
        response: { error: { code: 'INVALID_PASSWORD' } },
      });
    });

    it('updates the password and clears reset/refresh state on success', async () => {
      const user = buildUser({
        passwordResetExpiresAt: new Date(Date.now() + 60_000),
      });
      usersService.findByPasswordResetToken.mockResolvedValue(user);
      mockedBcrypt.compare.mockResolvedValue(false as never);
      prisma.user.update.mockResolvedValue(user);

      await service.resetPassword(dto);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: {
          password: 'hashed-password',
          passwordResetToken: null,
          passwordResetExpiresAt: null,
          hashedRefreshToken: null,
        },
      });
    });
  });

  describe('googleLogin', () => {
    const profile = {
      emailAddress: 'student@example.com',
      fullName: 'Ada Lovelace',
    };

    it('creates a new verified Google user when none exists', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      const newUser = buildUser({ oauthProvider: OAuthProvider.GOOGLE });
      usersService.createGoogleUser.mockResolvedValue(newUser);

      const result = await service.googleLogin(profile);

      expect(usersService.createGoogleUser).toHaveBeenCalledWith(profile);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });

    it('verifies an existing but unverified email account', async () => {
      const user = buildUser({ isEmailVerified: false });
      usersService.findByEmail.mockResolvedValue(user);
      prisma.user.update.mockResolvedValue({ ...user, isEmailVerified: true });

      await service.googleLogin(profile);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { isEmailVerified: true },
      });
    });

    it('does not touch an already-verified existing user', async () => {
      usersService.findByEmail.mockResolvedValue(buildUser());

      await service.googleLogin(profile);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(usersService.createGoogleUser).not.toHaveBeenCalled();
    });
  });
});
