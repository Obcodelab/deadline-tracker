import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface RegisteredUser {
  id: string;
  emailAddress: string;
  fullName: string;
  accessToken: string;
  refreshToken: string;
}

let sequence = 0;

/** A unique, deterministic-enough email for one test run. */
export function uniqueEmail(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}@example.com`;
}

interface RegisterOptions {
  fullName?: string;
  emailAddress?: string;
  password?: string;
}

/**
 * Signs a user up and verifies them via the real HTTP endpoints, reading the
 * OTP straight out of the DB (the app only console.logs it — there's no
 * email transport yet, see PRD §7.5).
 */
export async function registerVerifiedUser(
  app: INestApplication,
  prisma: PrismaService,
  options: RegisterOptions = {},
): Promise<RegisteredUser> {
  const fullName = options.fullName ?? 'Test Student';
  const emailAddress = options.emailAddress ?? uniqueEmail('student');
  const password = options.password ?? 'Password1!';

  await request(app.getHttpServer())
    .post('/auth/signup')
    .send({ fullName, emailAddress, password })
    .expect(201);

  const user = await prisma.user.findUniqueOrThrow({
    where: { emailAddress },
  });
  const token = await prisma.verificationToken.findFirstOrThrow({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  const verifyRes = await request(app.getHttpServer())
    .post('/auth/verify-otp')
    .send({ emailAddress, code: token.code })
    .expect(201);

  const data = verifyRes.body.data as {
    id: string;
    fullName: string;
    accessToken: string;
    refreshToken: string;
  };

  return { emailAddress, ...data };
}
