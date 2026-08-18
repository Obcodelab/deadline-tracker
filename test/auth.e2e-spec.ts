import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './support/e2e-app';
import { cleanupDatabase } from './support/db-cleanup';
import { registerVerifiedUser, uniqueEmail } from './support/auth-flow';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanupDatabase(prisma);
  });

  afterAll(async () => {
    await cleanupDatabase(prisma);
    await app.close();
  });

  describe('signup + verify-otp', () => {
    it('verifies a freshly signed-up user and returns tokens', async () => {
      const emailAddress = uniqueEmail('signup');

      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ fullName: 'New Student', emailAddress, password: 'Password1!' })
        .expect(201)
        .expect((res) => {
          expect(res.body).toMatchObject({ status: 'success' });
        });

      const user = await prisma.user.findUniqueOrThrow({
        where: { emailAddress },
      });
      expect(user.isEmailVerified).toBe(false);

      const token = await prisma.verificationToken.findFirstOrThrow({
        where: { userId: user.id },
      });

      const verifyRes = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ emailAddress, code: token.code })
        .expect(201);

      expect(verifyRes.body.data).toMatchObject({
        id: user.id,
        fullName: 'New Student',
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });

      const verifiedUser = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(verifiedUser.isEmailVerified).toBe(true);
    });

    it('rejects signup with a duplicate email', async () => {
      const emailAddress = uniqueEmail('dup');
      await registerVerifiedUser(app, prisma, { emailAddress });

      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          fullName: 'Someone Else',
          emailAddress,
          password: 'Password1!',
        })
        .expect(409)
        .expect((res) => {
          expect(res.body.error).toMatchObject({
            code: 'EMAIL_ALREADY_EXISTS',
          });
        });
    });

    it('rejects verify-otp with the wrong code', async () => {
      const emailAddress = uniqueEmail('wrongcode');
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ fullName: 'Student', emailAddress, password: 'Password1!' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ emailAddress, code: '000000' })
        .expect(400)
        .expect((res) => {
          expect(res.body.error).toMatchObject({ code: 'INVALID_OTP' });
        });
    });

    it('rejects re-verifying an already-verified email', async () => {
      const emailAddress = uniqueEmail('reverify');
      await registerVerifiedUser(app, prisma, { emailAddress });

      await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ emailAddress, code: '123456' })
        .expect(400)
        .expect((res) => {
          expect(res.body.error).toMatchObject({
            code: 'EMAIL_ALREADY_VERIFIED',
          });
        });
    });
  });

  describe('resend-otp', () => {
    it('does not reveal whether an email is registered', async () => {
      await request(app.getHttpServer())
        .post('/auth/resend-otp')
        .send({ emailAddress: uniqueEmail('unknown') })
        .expect(201);
    });

    it('reissues a working code for a pending signup', async () => {
      const emailAddress = uniqueEmail('resend');
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ fullName: 'Student', emailAddress, password: 'Password1!' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/resend-otp')
        .send({ emailAddress })
        .expect(201);

      const user = await prisma.user.findUniqueOrThrow({
        where: { emailAddress },
      });
      const token = await prisma.verificationToken.findFirstOrThrow({
        where: { userId: user.id },
      });

      await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ emailAddress, code: token.code })
        .expect(201);
    });
  });

  describe('login', () => {
    it('rejects login before the email is verified', async () => {
      const emailAddress = uniqueEmail('unverified');
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ fullName: 'Student', emailAddress, password: 'Password1!' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ emailAddress, password: 'Password1!' })
        .expect(401)
        .expect((res) => {
          expect(res.body.error).toMatchObject({
            code: 'EMAIL_NOT_VERIFIED',
          });
        });
    });

    it('rejects an incorrect password', async () => {
      const emailAddress = uniqueEmail('badpw');
      await registerVerifiedUser(app, prisma, { emailAddress });

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ emailAddress, password: 'WrongPassword1!' })
        .expect(401)
        .expect((res) => {
          expect(res.body.error).toMatchObject({
            code: 'INVALID_CREDENTIALS',
          });
        });
    });

    it('logs a verified user in', async () => {
      const emailAddress = uniqueEmail('login');
      await registerVerifiedUser(app, prisma, {
        emailAddress,
        password: 'Password1!',
      });

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ emailAddress, password: 'Password1!' })
        .expect(201);

      expect(res.body.data).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });
  });

  describe('refresh-token', () => {
    it('rejects a garbage refresh token', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh-token')
        .send({ refreshToken: 'not-a-real-token' })
        .expect(401)
        .expect((res) => {
          expect(res.body.error).toMatchObject({
            code: 'INVALID_REFRESH_TOKEN',
          });
        });
    });

    it('rotates a valid refresh token for a new pair', async () => {
      const user = await registerVerifiedUser(app, prisma);

      const res = await request(app.getHttpServer())
        .post('/auth/refresh-token')
        .send({ refreshToken: user.refreshToken })
        .expect(201);

      expect(res.body.data).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
    });
  });

  describe('forgot-password / reset-password', () => {
    function captureResetUrl(fn: () => Promise<unknown>): Promise<string> {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      return fn().then(() => {
        const logged = spy.mock.calls.map((call) => String(call[0])).join('\n');
        spy.mockRestore();
        const match = /https?:\/\/\S*token=\S+/.exec(logged);
        if (!match) {
          throw new Error('Reset URL was not logged.');
        }
        return match[0];
      });
    }

    it('does not reveal whether an email is registered', async () => {
      await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ emailAddress: uniqueEmail('unknown') })
        .expect(201);
    });

    it('rejects an invalid reset token', async () => {
      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({
          // Well-formed UUID (passes @IsUUID) that matches no stored token.
          token: crypto.randomUUID(),
          password: 'NewPassword1!',
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.error).toMatchObject({ code: 'INVALID_TOKEN' });
        });
    });

    it('resets the password and allows login with the new one', async () => {
      const emailAddress = uniqueEmail('reset');
      await registerVerifiedUser(app, prisma, {
        emailAddress,
        password: 'OldPassword1!',
      });

      const resetUrl = await captureResetUrl(() =>
        request(app.getHttpServer())
          .post('/auth/forgot-password')
          .send({ emailAddress })
          .expect(201),
      );
      const token = new URL(resetUrl).searchParams.get('token');

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token, password: 'NewPassword1!' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ emailAddress, password: 'OldPassword1!' })
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ emailAddress, password: 'NewPassword1!' })
        .expect(201);
    });

    it('rejects resetting to the same password', async () => {
      const emailAddress = uniqueEmail('samepw');
      await registerVerifiedUser(app, prisma, {
        emailAddress,
        password: 'Password1!',
      });

      const resetUrl = await captureResetUrl(() =>
        request(app.getHttpServer())
          .post('/auth/forgot-password')
          .send({ emailAddress })
          .expect(201),
      );
      const token = new URL(resetUrl).searchParams.get('token');

      await request(app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token, password: 'Password1!' })
        .expect(400)
        .expect((res) => {
          expect(res.body.error).toMatchObject({ code: 'INVALID_PASSWORD' });
        });
    });
  });
});
