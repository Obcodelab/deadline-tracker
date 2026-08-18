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

const course = {
  name: 'English Literature',
  code: 'EN101',
  term: 'FIRST_SEMESTER',
  color: '#ff6633',
};

describe('Deadlines & Checklist (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let owner: RegisteredUser;
  let member: RegisteredUser;
  let courseId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanupDatabase(prisma);
    owner = await registerVerifiedUser(app, prisma, { fullName: 'Owner' });
    member = await registerVerifiedUser(app, prisma, { fullName: 'Member' });

    const created = await authed(app, owner)
      .post('/courses')
      .send(course)
      .expect(201);
    courseId = created.body.data.id as string;
    await authed(app, member)
      .post('/courses/join')
      .send({ joinCode: created.body.data.joinCode })
      .expect(201);
  });

  afterAll(async () => {
    await cleanupDatabase(prisma);
    await app.close();
  });

  describe('create', () => {
    it('creates a deadline with nested course and progress', async () => {
      const res = await authed(app, owner)
        .post('/deadlines')
        .send({
          title: 'Essay',
          type: 'ASSIGNMENT',
          courseId,
          dueDate: '2027-01-15',
          dueTime: '10:00',
          priority: 'MEDIUM',
          checklistItems: [{ text: 'Outline' }, { text: 'Draft' }],
        })
        .expect(201);

      expect(res.body.data).toMatchObject({
        title: 'Essay',
        course: { id: courseId, code: 'EN101' },
        dueDate: '2027-01-15',
        dueTime: '10:00',
        status: 'upcoming',
        progress: { completed: 0, total: 2 },
      });
    });

    it('rejects creation by a non-owner member', async () => {
      await authed(app, member)
        .post('/deadlines')
        .send({
          title: 'Essay',
          type: 'ASSIGNMENT',
          courseId,
          dueDate: '2027-01-15',
          dueTime: '10:00',
          priority: 'MEDIUM',
        })
        .expect(403)
        .expect((res) => {
          expect(res.body.error).toMatchObject({ code: 'NOT_COURSE_OWNER' });
        });
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      await authed(app, owner)
        .post('/deadlines')
        .send({
          title: 'Overdue essay',
          type: 'ASSIGNMENT',
          courseId,
          dueDate: '2020-01-01',
          dueTime: '10:00',
          priority: 'HIGH',
        })
        .expect(201);
      await authed(app, owner)
        .post('/deadlines')
        .send({
          title: 'Future exam',
          type: 'EXAM',
          courseId,
          dueDate: '2027-06-01',
          dueTime: '09:00',
          priority: 'LOW',
        })
        .expect(201);
    });

    it('returns a lightweight list shape without description/checklistItems', async () => {
      const res = await authed(app, owner).get('/deadlines').expect(200);

      expect(res.body.data.items).toHaveLength(2);
      for (const item of res.body.data.items) {
        expect(item).not.toHaveProperty('description');
        expect(item).not.toHaveProperty('checklistItems');
        expect(item).toHaveProperty('progress');
      }
    });

    it('filters by type', async () => {
      const res = await authed(app, owner)
        .get('/deadlines?type=EXAM')
        .expect(200);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].title).toBe('Future exam');
    });

    it('filters by title search, case-insensitively', async () => {
      const res = await authed(app, owner)
        .get('/deadlines?search=OVERDUE')
        .expect(200);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].title).toBe('Overdue essay');
    });

    it('filters by computed status', async () => {
      const res = await authed(app, owner)
        .get('/deadlines?status=overdue')
        .expect(200);

      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].status).toBe('overdue');
    });

    it('is visible to a course member, scoped to their memberships', async () => {
      const res = await authed(app, member).get('/deadlines').expect(200);

      expect(res.body.data.items).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('recombines only the changed half of the due date/time', async () => {
      const created = await authed(app, owner)
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

      const res = await authed(app, owner)
        .patch(`/deadlines/${created.body.data.id}`)
        .send({ dueTime: '18:30' })
        .expect(200);

      expect(res.body.data).toMatchObject({
        dueDate: '2027-01-15',
        dueTime: '18:30',
      });
    });

    it('marks a deadline completed and back to incomplete', async () => {
      const created = await authed(app, owner)
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

      const completed = await authed(app, owner)
        .patch(`/deadlines/${created.body.data.id}`)
        .send({ completed: true })
        .expect(200);
      expect(completed.body.data.status).toBe('completed');

      const reopened = await authed(app, owner)
        .patch(`/deadlines/${created.body.data.id}`)
        .send({ completed: false })
        .expect(200);
      expect(reopened.body.data.status).toBe('upcoming');
    });

    it('rejects updates from a non-owner member', async () => {
      const created = await authed(app, owner)
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

      await authed(app, member)
        .patch(`/deadlines/${created.body.data.id}`)
        .send({ title: 'Hijacked' })
        .expect(403);
    });
  });

  describe('checklist', () => {
    let deadlineId: string;

    beforeEach(async () => {
      const created = await authed(app, owner)
        .post('/deadlines')
        .send({
          title: 'Group project',
          type: 'MILESTONE',
          courseId,
          dueDate: '2027-01-15',
          dueTime: '10:00',
          priority: 'HIGH',
        })
        .expect(201);
      deadlineId = created.body.data.id as string;
    });

    it('rejects adding a checklist item as a non-owner member', async () => {
      await authed(app, member)
        .post(`/deadlines/${deadlineId}/checklist`)
        .send({ text: 'Step 1' })
        .expect(403)
        .expect((res) => {
          expect(res.body.error).toMatchObject({ code: 'NOT_COURSE_OWNER' });
        });
    });

    it('lets the owner add items and any member toggle them', async () => {
      const added = await authed(app, owner)
        .post(`/deadlines/${deadlineId}/checklist`)
        .send({ text: 'Step 1' })
        .expect(201);
      expect(added.body.data.progress).toEqual({ completed: 0, total: 1 });

      const itemId = added.body.data.checklistItems[0].id as string;

      const toggled = await authed(app, member)
        .patch(`/checklist/${itemId}`)
        .send({ isComplete: true })
        .expect(200);

      expect(toggled.body.data).toMatchObject({
        item: { id: itemId, isComplete: true },
        progress: { completed: 1, total: 1 },
      });
    });

    it('lets only the owner delete a checklist item', async () => {
      const added = await authed(app, owner)
        .post(`/deadlines/${deadlineId}/checklist`)
        .send({ text: 'Step 1' })
        .expect(201);
      const itemId = added.body.data.checklistItems[0].id as string;

      await authed(app, member)
        .delete(`/checklist/${itemId}`)
        .expect(403)
        .expect((res) => {
          expect(res.body.error).toMatchObject({ code: 'NOT_COURSE_OWNER' });
        });

      const removed = await authed(app, owner)
        .delete(`/checklist/${itemId}`)
        .expect(200);
      expect(removed.body.data.progress).toEqual({ completed: 0, total: 0 });
    });

    it('404s for a checklist item that does not exist', async () => {
      await authed(app, owner)
        .patch('/checklist/11111111-1111-1111-1111-111111111111')
        .send({ isComplete: true })
        .expect(404)
        .expect((res) => {
          expect(res.body.error).toMatchObject({
            code: 'CHECKLIST_ITEM_NOT_FOUND',
          });
        });
    });
  });

  describe('remove', () => {
    it('lets only the owner delete the deadline', async () => {
      const created = await authed(app, owner)
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

      await authed(app, member)
        .delete(`/deadlines/${created.body.data.id}`)
        .expect(403);

      await authed(app, owner)
        .delete(`/deadlines/${created.body.data.id}`)
        .expect(200);

      await authed(app, owner)
        .get(`/deadlines/${created.body.data.id}`)
        .expect(404);
    });
  });
});
