import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './support/e2e-app';
import { cleanupDatabase } from './support/db-cleanup';
import { RegisteredUser, registerVerifiedUser } from './support/auth-flow';
import { PrismaService } from '../src/prisma/prisma.service';

function authed(app: INestApplication<App>, user: RegisteredUser) {
  return {
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${user.accessToken}`),
    patch: (url: string) =>
      request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${user.accessToken}`),
    post: (url: string) =>
      request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${user.accessToken}`),
  };
}

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let user: RegisteredUser;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanupDatabase(prisma);
    user = await registerVerifiedUser(app, prisma, {
      fullName: 'Ada Lovelace',
      password: 'Password1!',
    });
  });

  afterAll(async () => {
    await cleanupDatabase(prisma);
    await app.close();
  });

  it('rejects profile access without a token', async () => {
    await request(app.getHttpServer()).get('/users/get-profile').expect(401);
  });

  it("returns the caller's own profile", async () => {
    const res = await authed(app, user).get('/users/get-profile').expect(200);

    expect(res.body.data).toMatchObject({
      id: user.id,
      fullName: 'Ada Lovelace',
      emailAddress: user.emailAddress,
      isEmailVerified: true,
      bio: null,
    });
  });

  it('updates profile fields including bio', async () => {
    const res = await authed(app, user)
      .patch('/users/update-profile')
      .send({ bio: 'Loves algorithms', department: 'Computer Science' })
      .expect(200);

    expect(res.body.data).toMatchObject({
      bio: 'Loves algorithms',
      department: 'Computer Science',
    });
  });

  it('rejects a bio over the 300 character limit', async () => {
    await authed(app, user)
      .patch('/users/update-profile')
      .send({ bio: 'x'.repeat(301) })
      .expect(400)
      .expect((res) => {
        expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
      });
  });

  describe('reminder-preferences', () => {
    it('defaults to both channels for a new user', async () => {
      const res = await authed(app, user).get('/users/get-profile').expect(200);

      expect(res.body.data.reminderChannels.sort()).toEqual([
        'EMAIL',
        'IN_APP',
      ]);
    });

    it('updates the chosen channels', async () => {
      const res = await authed(app, user)
        .patch('/users/reminder-preferences')
        .send({ channels: ['EMAIL'] })
        .expect(200);

      expect(res.body.data.reminderChannels).toEqual(['EMAIL']);
    });

    it('rejects an empty channel list', async () => {
      await authed(app, user)
        .patch('/users/reminder-preferences')
        .send({ channels: [] })
        .expect(400)
        .expect((res) => {
          expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
        });
    });

    it('rejects an unknown channel value', async () => {
      await authed(app, user)
        .patch('/users/reminder-preferences')
        .send({ channels: ['SMS'] })
        .expect(400)
        .expect((res) => {
          expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
        });
    });
  });

  describe('change-password', () => {
    it('rejects an incorrect current password', async () => {
      await authed(app, user)
        .post('/users/change-password')
        .send({
          currentPassword: 'WrongPassword1!',
          newPassword: 'NewPassword1!',
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.error).toMatchObject({ code: 'INVALID_PASSWORD' });
        });
    });

    it('changes the password and allows login with the new one', async () => {
      await authed(app, user)
        .post('/users/change-password')
        .send({ currentPassword: 'Password1!', newPassword: 'NewPassword1!' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ emailAddress: user.emailAddress, password: 'Password1!' })
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ emailAddress: user.emailAddress, password: 'NewPassword1!' })
        .expect(201);
    });
  });

  describe('logout', () => {
    it('invalidates the refresh token', async () => {
      await authed(app, user).post('/users/logout').expect(201);

      await request(app.getHttpServer())
        .post('/auth/refresh-token')
        .send({ refreshToken: user.refreshToken })
        .expect(401)
        .expect((res) => {
          expect(res.body.error).toMatchObject({
            code: 'INVALID_REFRESH_TOKEN',
          });
        });
    });
  });
});
