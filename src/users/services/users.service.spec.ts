import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { OAuthProvider, User } from '@prisma/client';
import { UsersService } from './users.service';
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

describe('UsersService', () => {
  let service: UsersService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(UsersService);

    mockedBcrypt.hash.mockResolvedValue('hashed-password' as never);
    mockedBcrypt.compare.mockResolvedValue(true as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('updateRefreshToken', () => {
    it('hashes and stores the refresh token', async () => {
      prisma.user.update.mockResolvedValue(buildUser());

      await service.updateRefreshToken('user-1', 'a-refresh-token');

      expect(mockedBcrypt.hash).toHaveBeenCalledWith('a-refresh-token', 12);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { hashedRefreshToken: 'hashed-password' },
      });
    });
  });

  describe('clearRefreshToken', () => {
    it('nulls out the stored refresh token', async () => {
      prisma.user.update.mockResolvedValue(buildUser());

      await service.clearRefreshToken('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { hashedRefreshToken: null },
      });
    });
  });

  describe('updateLastLogin', () => {
    it('stamps lastLoginAt with the current time', async () => {
      prisma.user.update.mockResolvedValue(buildUser());

      await service.updateLastLogin('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { lastLoginAt: expect.any(Date) },
      });
    });
  });

  describe('findByEmail', () => {
    it('passes through the raw Prisma user record', async () => {
      const user = buildUser();
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await service.findByEmail('student@example.com');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { emailAddress: 'student@example.com' },
      });
      expect(result).toBe(user);
    });
  });

  describe('findById', () => {
    it('returns null when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.findById('missing');

      expect(result).toBeNull();
    });

    it('maps the found user onto the profile response shape', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        fullName: 'Ada Lovelace',
        emailAddress: 'student@example.com',
        department: null,
        faculty: null,
        bio: 'Loves algorithms',
        isEmailVerified: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.findById('user-1');

      expect(result).toMatchObject({
        id: 'user-1',
        fullName: 'Ada Lovelace',
        bio: 'Loves algorithms',
      });
    });
  });

  describe('updateProfile', () => {
    it('updates the given fields and returns the mapped profile', async () => {
      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        fullName: 'Ada L.',
        emailAddress: 'student@example.com',
        department: 'Computer Science',
        faculty: null,
        bio: 'Loves algorithms',
        isEmailVerified: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.updateProfile('user-1', {
        fullName: 'Ada L.',
        department: 'Computer Science',
        bio: 'Loves algorithms',
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: {
            fullName: 'Ada L.',
            department: 'Computer Science',
            bio: 'Loves algorithms',
          },
        }),
      );
      expect(result).toMatchObject({
        fullName: 'Ada L.',
        department: 'Computer Science',
        bio: 'Loves algorithms',
      });
    });
  });

  describe('changePassword', () => {
    const dto = {
      currentPassword: 'OldPassword1!',
      newPassword: 'NewPassword1!',
    };

    it('throws userNotFound when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.changePassword('user-1', dto)).rejects.toMatchObject(
        { response: { error: { code: 'USER_NOT_FOUND' } } },
      );
    });

    it('throws passwordNotSet for a Google-only account', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ password: null }));

      await expect(service.changePassword('user-1', dto)).rejects.toMatchObject(
        { response: { error: { code: 'PASSWORD_NOT_SET' } } },
      );
    });

    it('throws invalidPassword when the current password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      mockedBcrypt.compare.mockResolvedValue(false as never);

      await expect(service.changePassword('user-1', dto)).rejects.toMatchObject(
        { response: { error: { code: 'INVALID_PASSWORD' } } },
      );
    });

    it('hashes and stores the new password on success', async () => {
      const user = buildUser();
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.user.update.mockResolvedValue(user);

      const result = await service.changePassword('user-1', dto);

      expect(mockedBcrypt.hash).toHaveBeenCalledWith('NewPassword1!', 12);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { password: 'hashed-password' },
      });
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('throws emailAlreadyExists when the email is taken', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());

      await expect(
        service.create({
          fullName: 'Ada',
          emailAddress: 'student@example.com',
          password: 'hashed-password',
        }),
      ).rejects.toMatchObject({
        response: { error: { code: 'EMAIL_ALREADY_EXISTS' } },
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('creates an EMAIL-provider user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(buildUser());

      await service.create({
        fullName: 'Ada',
        emailAddress: 'student@example.com',
        password: 'hashed-password',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          fullName: 'Ada',
          emailAddress: 'student@example.com',
          password: 'hashed-password',
          oauthProvider: OAuthProvider.EMAIL,
        },
      });
    });
  });

  describe('createGoogleUser', () => {
    it('creates a verified GOOGLE-provider user with the given full name', async () => {
      prisma.user.create.mockResolvedValue(buildUser());

      await service.createGoogleUser({
        emailAddress: 'student@example.com',
        fullName: 'Ada Lovelace',
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          emailAddress: 'student@example.com',
          fullName: 'Ada Lovelace',
          oauthProvider: OAuthProvider.GOOGLE,
          isEmailVerified: true,
        },
      });
    });

    it('falls back to the email local-part when no full name is provided', async () => {
      prisma.user.create.mockResolvedValue(buildUser());

      await service.createGoogleUser({ emailAddress: 'student@example.com' });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fullName: 'student' }),
        }),
      );
    });
  });

  describe('logout', () => {
    it('clears the stored refresh token', async () => {
      prisma.user.update.mockResolvedValue(buildUser());

      const result = await service.logout('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { hashedRefreshToken: null },
      });
      expect(result).toBeNull();
    });
  });
});
