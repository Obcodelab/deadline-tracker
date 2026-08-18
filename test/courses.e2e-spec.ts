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
    delete: (url: string) =>
      request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${user.accessToken}`),
  };
}

const validCourse = {
  name: 'Data Structures',
  code: 'CS201',
  term: 'FIRST_SEMESTER',
  color: '#3366ff',
};

describe('Courses (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let owner: RegisteredUser;
  let member: RegisteredUser;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanupDatabase(prisma);
    owner = await registerVerifiedUser(app, prisma, { fullName: 'Owner' });
    member = await registerVerifiedUser(app, prisma, { fullName: 'Member' });
  });

  afterAll(async () => {
    await cleanupDatabase(prisma);
    await app.close();
  });

  describe('create', () => {
    it('creates a course owned by the caller', async () => {
      const res = await authed(app, owner)
        .post('/courses')
        .send(validCourse)
        .expect(201);

      expect(res.body.data).toMatchObject({
        name: 'Data Structures',
        code: 'CS201',
        archived: false,
        ownerId: owner.id,
        joinCode: expect.stringMatching(/^[A-Z0-9]{8}$/),
      });
    });

    it('rejects a duplicate code for the same owner', async () => {
      await authed(app, owner).post('/courses').send(validCourse).expect(201);

      await authed(app, owner)
        .post('/courses')
        .send(validCourse)
        .expect(409)
        .expect((res) => {
          expect(res.body.error).toMatchObject({
            code: 'COURSE_CODE_ALREADY_EXISTS',
          });
        });
    });

    it('rejects an invalid color', async () => {
      await authed(app, owner)
        .post('/courses')
        .send({ ...validCourse, color: 'blue' })
        .expect(400)
        .expect((res) => {
          expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
        });
    });
  });

  describe('findAll / findOne', () => {
    it("lists only the caller's own courses with pagination meta", async () => {
      await authed(app, owner).post('/courses').send(validCourse).expect(201);

      const res = await authed(app, owner)
        .get('/courses?page=1&limit=20')
        .expect(200);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.meta).toMatchObject({
        page: 1,
        limit: 20,
        total: 1,
      });

      const memberRes = await authed(app, member).get('/courses').expect(200);
      expect(memberRes.body.data.items).toHaveLength(0);
    });

    it('rejects fetching a course the caller is not a member of', async () => {
      const created = await authed(app, owner)
        .post('/courses')
        .send(validCourse)
        .expect(201);

      await authed(app, member)
        .get(`/courses/${created.body.data.id}`)
        .expect(403)
        .expect((res) => {
          expect(res.body.error).toMatchObject({
            code: 'NOT_COURSE_MEMBER',
          });
        });
    });
  });

  describe('update', () => {
    it('rejects updates from a non-owner member', async () => {
      const created = await authed(app, owner)
        .post('/courses')
        .send(validCourse)
        .expect(201);
      await authed(app, member)
        .post('/courses/join')
        .send({ joinCode: created.body.data.joinCode })
        .expect(201);

      await authed(app, member)
        .patch(`/courses/${created.body.data.id}`)
        .send({ name: 'Hijacked' })
        .expect(403)
        .expect((res) => {
          expect(res.body.error).toMatchObject({ code: 'NOT_COURSE_OWNER' });
        });
    });

    it('lets the owner archive the course', async () => {
      const created = await authed(app, owner)
        .post('/courses')
        .send(validCourse)
        .expect(201);

      const res = await authed(app, owner)
        .patch(`/courses/${created.body.data.id}`)
        .send({ archived: true })
        .expect(200);

      expect(res.body.data.archived).toBe(true);
    });
  });

  describe('join', () => {
    it('rejects an invalid join code', async () => {
      await authed(app, member)
        .post('/courses/join')
        .send({ joinCode: 'BADCODE1' })
        .expect(404)
        .expect((res) => {
          expect(res.body.error).toMatchObject({ code: 'INVALID_JOIN_CODE' });
        });
    });

    it('joins a member and rejects joining twice', async () => {
      const created = await authed(app, owner)
        .post('/courses')
        .send(validCourse)
        .expect(201);
      const joinCode = created.body.data.joinCode as string;

      await authed(app, member)
        .post('/courses/join')
        .send({ joinCode })
        .expect(201);

      await authed(app, member)
        .post('/courses/join')
        .send({ joinCode })
        .expect(409)
        .expect((res) => {
          expect(res.body.error).toMatchObject({
            code: 'ALREADY_COURSE_MEMBER',
          });
        });
    });
  });

  describe('listMembers', () => {
    it('exposes emails only to the owner', async () => {
      const created = await authed(app, owner)
        .post('/courses')
        .send(validCourse)
        .expect(201);
      const courseId = created.body.data.id as string;
      await authed(app, member)
        .post('/courses/join')
        .send({ joinCode: created.body.data.joinCode })
        .expect(201);

      const ownerView = await authed(app, owner)
        .get(`/courses/${courseId}/members`)
        .expect(200);
      const memberView = await authed(app, member)
        .get(`/courses/${courseId}/members`)
        .expect(200);

      const ownerRow = ownerView.body.data.find(
        (m: { id: string }) => m.id === member.id,
      );
      const memberRow = memberView.body.data.find(
        (m: { id: string }) => m.id === member.id,
      );

      expect(ownerRow.emailAddress).toBe(member.emailAddress);
      expect(memberRow.emailAddress).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('blocks deletion while deadlines are linked, then allows it once removed', async () => {
      const created = await authed(app, owner)
        .post('/courses')
        .send(validCourse)
        .expect(201);
      const courseId = created.body.data.id as string;

      const deadline = await authed(app, owner)
        .post('/deadlines')
        .send({
          title: 'Essay',
          type: 'ASSIGNMENT',
          courseId,
          dueDate: '2027-01-15',
          dueTime: '10:00',
          priority: 'MEDIUM',
        })
        .expect(201);

      await authed(app, owner)
        .delete(`/courses/${courseId}`)
        .expect(409)
        .expect((res) => {
          expect(res.body.error).toMatchObject({
            code: 'COURSE_HAS_LINKED_DEADLINES',
          });
        });

      await authed(app, owner)
        .delete(`/deadlines/${deadline.body.data.id}`)
        .expect(200);

      await authed(app, owner).delete(`/courses/${courseId}`).expect(200);
    });
  });
});
