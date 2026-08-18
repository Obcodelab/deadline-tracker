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
    post: (url: string) =>
      request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${user.accessToken}`),
    patch: (url: string) =>
      request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${user.accessToken}`),
  };
}

/** UTC-midnight date string for "today + N days", matching the app's own
 * UTC-anchored bucket math so this doesn't depend on the runner's timezone. */
function utcDateString(daysFromNow: number): string {
  const now = new Date();
  const base = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return new Date(base + daysFromNow * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

const course = {
  name: 'English Literature',
  code: 'EN101',
  term: 'FIRST_SEMESTER',
  color: '#ff6633',
};

describe('Dashboard (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let owner: RegisteredUser;
  let courseId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanupDatabase(prisma);
    owner = await registerVerifiedUser(app, prisma);

    const created = await authed(app, owner)
      .post('/courses')
      .send(course)
      .expect(201);
    courseId = created.body.data.id as string;
  });

  afterAll(async () => {
    await cleanupDatabase(prisma);
    await app.close();
  });

  async function createDeadline(title: string, daysFromNow: number) {
    return authed(app, owner)
      .post('/deadlines')
      .send({
        title,
        type: 'ASSIGNMENT',
        courseId,
        dueDate: utcDateString(daysFromNow),
        dueTime: '12:00',
        priority: 'MEDIUM',
      })
      .expect(201);
  }

  it('buckets deadlines into overdue / today / thisWeek / later', async () => {
    await createDeadline('Was due yesterday', -1);
    await createDeadline('Due today', 0);
    await createDeadline('Due in 3 days', 3);
    await createDeadline('Due in 10 days', 10);

    const res = await authed(app, owner).get('/dashboard').expect(200);

    expect(
      res.body.data.overdue.map((i: { title: string }) => i.title),
    ).toEqual(['Was due yesterday']);
    expect(res.body.data.today.map((i: { title: string }) => i.title)).toEqual([
      'Due today',
    ]);
    expect(
      res.body.data.thisWeek.map((i: { title: string }) => i.title),
    ).toEqual(['Due in 3 days']);
    expect(res.body.data.later.map((i: { title: string }) => i.title)).toEqual([
      'Due in 10 days',
    ]);
  });

  it('excludes completed deadlines', async () => {
    const created = await createDeadline('Finished already', 0);
    await authed(app, owner)
      .patch(`/deadlines/${created.body.data.id}`)
      .send({ completed: true })
      .expect(200);

    const res = await authed(app, owner).get('/dashboard').expect(200);

    const allIds = [
      ...res.body.data.overdue,
      ...res.body.data.today,
      ...res.body.data.thisWeek,
      ...res.body.data.later,
    ].map((i: { id: string }) => i.id);
    expect(allIds).not.toContain(created.body.data.id);
  });

  it('filters by type', async () => {
    await createDeadline('An assignment', 0);
    await authed(app, owner)
      .post('/deadlines')
      .send({
        title: 'An exam',
        type: 'EXAM',
        courseId,
        dueDate: utcDateString(0),
        dueTime: '12:00',
        priority: 'HIGH',
      })
      .expect(201);

    const res = await authed(app, owner)
      .get('/dashboard?type=EXAM')
      .expect(200);

    expect(res.body.data.today).toHaveLength(1);
    expect(res.body.data.today[0].title).toBe('An exam');
  });

  it('rejects filtering by a course the caller does not belong to', async () => {
    const outsider = await registerVerifiedUser(app, prisma);

    await authed(app, outsider)
      .get(`/dashboard?course=${courseId}`)
      .expect(403)
      .expect((res) => {
        expect(res.body.error).toMatchObject({ code: 'NOT_COURSE_MEMBER' });
      });
  });
});
