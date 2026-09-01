import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ReminderChannel } from '@prisma/client';
import { createTestApp } from './support/e2e-app';
import { cleanupDatabase } from './support/db-cleanup';
import { RegisteredUser, registerVerifiedUser } from './support/auth-flow';
import { PrismaService } from '../src/prisma/prisma.service';
import { RemindersService } from '../src/reminders/services/reminders.service';

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

const course = {
  name: 'English Literature',
  code: 'EN101',
  term: 'FIRST_SEMESTER',
  color: '#ff6633',
};

describe('Notifications / Reminders (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let reminders: RemindersService;
  let owner: RegisteredUser;
  let courseId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    reminders = app.get(RemindersService);
  });

  beforeEach(async () => {
    await cleanupDatabase(prisma);
    owner = await registerVerifiedUser(app, prisma, { fullName: 'Owner' });

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

  it('creates default 24h/1h reminders on both channels when a deadline is created', async () => {
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

    const rows = await prisma.reminder.findMany({
      where: { deadlineId: created.body.data.id as string },
    });

    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.offsetMinutes).sort((a, b) => a - b)).toEqual([
      60, 60, 1440, 1440,
    ]);
    expect(rows.every((r) => r.sentAt === null)).toBe(true);
  });

  it("only creates reminders on the deadline creator's chosen channel", async () => {
    await authed(app, owner)
      .patch('/users/reminder-preferences')
      .send({ channels: ['IN_APP'] })
      .expect(200);

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

    const rows = await prisma.reminder.findMany({
      where: { deadlineId: created.body.data.id as string },
    });

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.channel === ReminderChannel.IN_APP)).toBe(true);
  });

  it("backfills a joining member using their own channel preference, not the owner's", async () => {
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

    const courseRes = await authed(app, owner)
      .get(`/courses/${courseId}`)
      .expect(200);
    const joinCode = courseRes.body.data.joinCode as string;

    const member = await registerVerifiedUser(app, prisma);
    await authed(app, member)
      .patch('/users/reminder-preferences')
      .send({ channels: ['EMAIL'] })
      .expect(200);
    await authed(app, member)
      .post('/courses/join')
      .send({ joinCode })
      .expect(201);

    const memberRows = await prisma.reminder.findMany({
      where: { deadlineId: created.body.data.id as string, userId: member.id },
    });
    expect(memberRows).toHaveLength(2);
    expect(memberRows.every((r) => r.channel === ReminderChannel.EMAIL)).toBe(
      true,
    );
  });

  it('backfills reminders for a member joining a course with an upcoming deadline', async () => {
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

    const courseRes = await authed(app, owner)
      .get(`/courses/${courseId}`)
      .expect(200);
    const joinCode = courseRes.body.data.joinCode as string;

    const member = await registerVerifiedUser(app, prisma);
    await authed(app, member)
      .post('/courses/join')
      .send({ joinCode })
      .expect(201);

    const memberRows = await prisma.reminder.findMany({
      where: { deadlineId: created.body.data.id as string, userId: member.id },
    });
    expect(memberRows).toHaveLength(4);
  });

  it('shows nothing in the notification feed until reminders are dispatched', async () => {
    await authed(app, owner)
      .post('/deadlines')
      .send({
        title: 'Essay due soon',
        type: 'ASSIGNMENT',
        courseId,
        dueDate: new Date(Date.now() + 30 * 60_000).toISOString().slice(0, 10),
        dueTime: '10:00',
        priority: 'MEDIUM',
      })
      .expect(201);

    const before = await authed(app, owner).get('/notifications').expect(200);
    expect(before.body.data.items).toHaveLength(0);
  });

  it('surfaces fired in-app reminders once dispatched, and only in-app ones', async () => {
    const dueAt = new Date(Date.now() + 30 * 60_000);
    await authed(app, owner)
      .post('/deadlines')
      .send({
        title: 'Essay due very soon',
        type: 'ASSIGNMENT',
        courseId,
        dueDate: dueAt.toISOString().slice(0, 10),
        dueTime: `${String(dueAt.getUTCHours()).padStart(2, '0')}:${String(
          dueAt.getUTCMinutes(),
        ).padStart(2, '0')}`,
        priority: 'MEDIUM',
      })
      .expect(201);

    // Both default offsets (24h, 1h before) are already in the past relative
    // to a deadline due in 30 minutes, so a dispatch tick fires everything.
    await reminders.dispatchDueReminders();

    const res = await authed(app, owner).get('/notifications').expect(200);

    expect(res.body.data.items).toHaveLength(2);
    for (const item of res.body.data.items) {
      expect(item.deadline.title).toBe('Essay due very soon');
    }

    const emailRows = await prisma.reminder.findMany({
      where: { channel: ReminderChannel.EMAIL },
    });
    expect(emailRows.every((r) => r.sentAt !== null)).toBe(true);
  });

  /** Creates a deadline due in 30min (both default offsets already elapsed)
   * and dispatches it, returning the resulting in-app notification id. */
  async function createFiredNotification(title: string): Promise<string> {
    const dueAt = new Date(Date.now() + 30 * 60_000);
    await authed(app, owner)
      .post('/deadlines')
      .send({
        title,
        type: 'ASSIGNMENT',
        courseId,
        dueDate: dueAt.toISOString().slice(0, 10),
        dueTime: `${String(dueAt.getUTCHours()).padStart(2, '0')}:${String(
          dueAt.getUTCMinutes(),
        ).padStart(2, '0')}`,
        priority: 'MEDIUM',
      })
      .expect(201);

    await reminders.dispatchDueReminders();

    const res = await authed(app, owner).get('/notifications').expect(200);
    const item = res.body.data.items.find(
      (i: { deadline: { title: string } }) => i.deadline.title === title,
    );
    return item.id as string;
  }

  /** A deadline due this soon crosses both default offsets (24h, 1h) at
   * once, so it fires as two separate notification rows, not one. */
  async function findAllNotificationIds(title: string): Promise<string[]> {
    const res = await authed(app, owner).get('/notifications').expect(200);
    return res.body.data.items
      .filter(
        (i: { deadline: { title: string } }) => i.deadline.title === title,
      )
      .map((i: { id: string }) => i.id);
  }

  describe('isRead', () => {
    it('defaults new notifications to unread', async () => {
      await createFiredNotification('Unread by default');

      const res = await authed(app, owner).get('/notifications').expect(200);
      expect(res.body.data.items[0].isRead).toBe(false);
    });

    it('marks a single notification read via PATCH /notifications/:id', async () => {
      const id = await createFiredNotification('Mark me read');

      const patched = await authed(app, owner)
        .patch(`/notifications/${id}`)
        .send({ isRead: true })
        .expect(200);
      expect(patched.body.data.isRead).toBe(true);

      const rows = await prisma.reminder.findMany({ where: { id } });
      expect(rows[0].isRead).toBe(true);
    });

    it("rejects marking another user's notification", async () => {
      const id = await createFiredNotification('Not yours');
      const stranger = await registerVerifiedUser(app, prisma);

      await authed(app, stranger)
        .patch(`/notifications/${id}`)
        .send({ isRead: true })
        .expect(404)
        .expect((res) => {
          expect(res.body.error).toMatchObject({
            code: 'NOTIFICATION_NOT_FOUND',
          });
        });
    });

    it('marks every unread notification read via PATCH /notifications/read-all', async () => {
      await createFiredNotification('Bulk 1');
      await createFiredNotification('Bulk 2');

      await authed(app, owner).patch('/notifications/read-all').expect(200);

      const res = await authed(app, owner).get('/notifications').expect(200);
      expect(
        res.body.data.items.every((i: { isRead: boolean }) => i.isRead),
      ).toBe(true);
    });

    it('filters to only unread notifications with ?unread=true', async () => {
      await createFiredNotification('Already read');
      await createFiredNotification('Still unread');

      const readIds = await findAllNotificationIds('Already read');
      for (const id of readIds) {
        await authed(app, owner)
          .patch(`/notifications/${id}`)
          .send({ isRead: true })
          .expect(200);
      }

      const res = await authed(app, owner)
        .get('/notifications?unread=true')
        .expect(200);

      const stillUnreadIds = await findAllNotificationIds('Still unread');
      expect(res.body.data.items).toHaveLength(stillUnreadIds.length);
      expect(
        res.body.data.items.every(
          (i: { deadline: { title: string } }) =>
            i.deadline.title === 'Still unread',
        ),
      ).toBe(true);
    });
  });

  it('cancels pending reminders when a deadline is marked completed', async () => {
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

    await authed(app, owner)
      .patch(`/deadlines/${created.body.data.id}`)
      .send({ completed: true })
      .expect(200);

    const rows = await prisma.reminder.findMany({
      where: { deadlineId: created.body.data.id as string },
    });
    expect(rows).toHaveLength(0);
  });

  it('recalculates reminders when the due date changes', async () => {
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

    await authed(app, owner)
      .patch(`/deadlines/${created.body.data.id}`)
      .send({ dueDate: '2027-03-01' })
      .expect(200);

    const rows = await prisma.reminder.findMany({
      where: { deadlineId: created.body.data.id as string },
    });
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.sentAt === null)).toBe(true);
  });
});
