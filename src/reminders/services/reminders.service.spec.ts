import { Test } from '@nestjs/testing';
import { ReminderChannel } from '@prisma/client';
import { RemindersService } from './reminders.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createMockPrismaService,
  MockPrismaService,
} from '../../test/support/mock-prisma';

const NOW = new Date('2026-08-18T12:00:00.000Z');

describe('RemindersService', () => {
  let service: RemindersService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module = await Test.createTestingModule({
      providers: [
        RemindersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(RemindersService);

    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('createRemindersForDeadline', () => {
    it('creates default-offset rows for every course member, per their channel preference', async () => {
      prisma.courseMember.findMany.mockResolvedValue([
        {
          userId: 'user-1',
          user: {
            reminderChannels: [ReminderChannel.IN_APP, ReminderChannel.EMAIL],
          },
        },
        {
          userId: 'user-2',
          user: {
            reminderChannels: [ReminderChannel.IN_APP, ReminderChannel.EMAIL],
          },
        },
      ]);
      prisma.reminder.createMany.mockResolvedValue({ count: 4 });

      await service.createRemindersForDeadline('deadline-1', 'course-1');

      expect(prisma.courseMember.findMany).toHaveBeenCalledWith({
        where: { courseId: 'course-1' },
        select: {
          userId: true,
          user: { select: { reminderChannels: true } },
        },
      });
      expect(prisma.reminder.createMany).toHaveBeenCalledTimes(2);
      expect(prisma.reminder.createMany).toHaveBeenCalledWith({
        data: [
          {
            deadlineId: 'deadline-1',
            userId: 'user-1',
            offsetMinutes: 1440,
            channel: ReminderChannel.IN_APP,
          },
          {
            deadlineId: 'deadline-1',
            userId: 'user-1',
            offsetMinutes: 1440,
            channel: ReminderChannel.EMAIL,
          },
          {
            deadlineId: 'deadline-1',
            userId: 'user-1',
            offsetMinutes: 60,
            channel: ReminderChannel.IN_APP,
          },
          {
            deadlineId: 'deadline-1',
            userId: 'user-1',
            offsetMinutes: 60,
            channel: ReminderChannel.EMAIL,
          },
        ],
        skipDuplicates: true,
      });
    });

    it('does nothing when the course has no members', async () => {
      prisma.courseMember.findMany.mockResolvedValue([]);

      await service.createRemindersForDeadline('deadline-1', 'course-1');

      expect(prisma.reminder.createMany).not.toHaveBeenCalled();
    });

    it('only creates rows for the channels a member has chosen', async () => {
      prisma.courseMember.findMany.mockResolvedValue([
        {
          userId: 'user-1',
          user: { reminderChannels: [ReminderChannel.IN_APP] },
        },
      ]);
      prisma.reminder.createMany.mockResolvedValue({ count: 2 });

      await service.createRemindersForDeadline('deadline-1', 'course-1');

      expect(prisma.reminder.createMany).toHaveBeenCalledWith({
        data: [
          {
            deadlineId: 'deadline-1',
            userId: 'user-1',
            offsetMinutes: 1440,
            channel: ReminderChannel.IN_APP,
          },
          {
            deadlineId: 'deadline-1',
            userId: 'user-1',
            offsetMinutes: 60,
            channel: ReminderChannel.IN_APP,
          },
        ],
        skipDuplicates: true,
      });
    });

    it('skips a member who has opted out of every channel', async () => {
      prisma.courseMember.findMany.mockResolvedValue([
        { userId: 'user-1', user: { reminderChannels: [] } },
      ]);

      await service.createRemindersForDeadline('deadline-1', 'course-1');

      expect(prisma.reminder.createMany).not.toHaveBeenCalled();
    });
  });

  describe('createRemindersForNewMember', () => {
    it('backfills reminders only for upcoming, incomplete deadlines', async () => {
      prisma.deadline.findMany.mockResolvedValue([
        { id: 'deadline-1' },
        { id: 'deadline-2' },
      ]);
      prisma.user.findUnique.mockResolvedValue({
        reminderChannels: [ReminderChannel.IN_APP, ReminderChannel.EMAIL],
      });
      prisma.reminder.createMany.mockResolvedValue({ count: 8 });

      await service.createRemindersForNewMember('course-1', 'user-1');

      expect(prisma.deadline.findMany).toHaveBeenCalledWith({
        where: {
          courseId: 'course-1',
          completedAt: null,
          dueAt: { gt: NOW },
        },
        select: { id: true },
      });
      expect(prisma.reminder.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            deadlineId: 'deadline-1',
            userId: 'user-1',
          }),
          expect.objectContaining({
            deadlineId: 'deadline-2',
            userId: 'user-1',
          }),
        ]),
        skipDuplicates: true,
      });
    });

    it('does nothing when there are no upcoming deadlines', async () => {
      prisma.deadline.findMany.mockResolvedValue([]);

      await service.createRemindersForNewMember('course-1', 'user-1');

      expect(prisma.reminder.createMany).not.toHaveBeenCalled();
    });

    it("backfills using only the joining member's chosen channels", async () => {
      prisma.deadline.findMany.mockResolvedValue([{ id: 'deadline-1' }]);
      prisma.user.findUnique.mockResolvedValue({
        reminderChannels: [ReminderChannel.EMAIL],
      });
      prisma.reminder.createMany.mockResolvedValue({ count: 1 });

      await service.createRemindersForNewMember('course-1', 'user-1');

      expect(prisma.reminder.createMany).toHaveBeenCalledWith({
        data: [
          {
            deadlineId: 'deadline-1',
            userId: 'user-1',
            offsetMinutes: 1440,
            channel: ReminderChannel.EMAIL,
          },
          {
            deadlineId: 'deadline-1',
            userId: 'user-1',
            offsetMinutes: 60,
            channel: ReminderChannel.EMAIL,
          },
        ],
        skipDuplicates: true,
      });
    });
  });

  describe('syncRemindersForDeadline', () => {
    it('clears unsent reminders and regenerates them for an incomplete deadline', async () => {
      prisma.reminder.deleteMany.mockResolvedValue({ count: 4 });
      prisma.courseMember.findMany.mockResolvedValue([
        {
          userId: 'user-1',
          user: {
            reminderChannels: [ReminderChannel.IN_APP, ReminderChannel.EMAIL],
          },
        },
      ]);
      prisma.reminder.createMany.mockResolvedValue({ count: 4 });

      await service.syncRemindersForDeadline('deadline-1', 'course-1', null);

      expect(prisma.reminder.deleteMany).toHaveBeenCalledWith({
        where: { deadlineId: 'deadline-1', sentAt: null },
      });
      expect(prisma.reminder.createMany).toHaveBeenCalled();
    });

    it('only clears unsent reminders for a completed deadline, without regenerating', async () => {
      prisma.reminder.deleteMany.mockResolvedValue({ count: 4 });

      await service.syncRemindersForDeadline(
        'deadline-1',
        'course-1',
        new Date('2026-08-18T12:00:00.000Z'),
      );

      expect(prisma.reminder.deleteMany).toHaveBeenCalledWith({
        where: { deadlineId: 'deadline-1', sentAt: null },
      });
      expect(prisma.courseMember.findMany).not.toHaveBeenCalled();
      expect(prisma.reminder.createMany).not.toHaveBeenCalled();
    });
  });

  describe('getNotifications', () => {
    function buildNotificationRow(overrides: { isRead?: boolean } = {}) {
      return {
        id: 'reminder-1',
        offsetMinutes: 60,
        sentAt: new Date('2026-08-18T11:00:00.000Z'),
        isRead: overrides.isRead ?? false,
        deadline: {
          id: 'deadline-1',
          title: 'Essay',
          dueAt: new Date('2026-08-18T12:00:00.000Z'),
          course: {
            id: 'course-1',
            name: 'English',
            code: 'EN101',
            color: '#fff',
          },
        },
      };
    }

    it('returns only sent, in-app notifications for the caller, paginated', async () => {
      prisma.reminder.findMany.mockResolvedValue([buildNotificationRow()]);
      prisma.reminder.count.mockResolvedValue(1);

      const result = await service.getNotifications('user-1', {
        page: 1,
        limit: 20,
      });

      expect(prisma.reminder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            channel: ReminderChannel.IN_APP,
            sentAt: { not: null },
          },
        }),
      );
      expect(result.items[0]).toMatchObject({
        id: 'reminder-1',
        offsetMinutes: 60,
        isRead: false,
        deadline: {
          id: 'deadline-1',
          title: 'Essay',
          dueDate: '2026-08-18',
          dueTime: '12:00',
        },
      });
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('adds an isRead: false filter when unread=true is passed', async () => {
      prisma.reminder.findMany.mockResolvedValue([]);
      prisma.reminder.count.mockResolvedValue(0);

      await service.getNotifications('user-1', {
        page: 1,
        limit: 20,
        unread: true,
      });

      expect(prisma.reminder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            channel: ReminderChannel.IN_APP,
            sentAt: { not: null },
            isRead: false,
          },
        }),
      );
    });
  });

  describe('markAsRead', () => {
    const sentRow = {
      id: 'reminder-1',
      userId: 'user-1',
      channel: ReminderChannel.IN_APP,
      sentAt: new Date('2026-08-18T11:00:00.000Z'),
    };

    it("marks the caller's own fired in-app notification read", async () => {
      prisma.reminder.findUnique.mockResolvedValue(sentRow);
      prisma.reminder.update.mockResolvedValue({
        id: 'reminder-1',
        offsetMinutes: 60,
        sentAt: sentRow.sentAt,
        isRead: true,
        deadline: {
          id: 'deadline-1',
          title: 'Essay',
          dueAt: new Date('2026-08-18T12:00:00.000Z'),
          course: {
            id: 'course-1',
            name: 'English',
            code: 'EN101',
            color: '#fff',
          },
        },
      });

      const result = await service.markAsRead('reminder-1', 'user-1', {
        isRead: true,
      });

      expect(prisma.reminder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'reminder-1' },
          data: { isRead: true },
        }),
      );
      expect(result).toMatchObject({ id: 'reminder-1', isRead: true });
    });

    it('throws notFound for a reminder that does not exist', async () => {
      prisma.reminder.findUnique.mockResolvedValue(null);

      await expect(
        service.markAsRead('missing', 'user-1', { isRead: true }),
      ).rejects.toMatchObject({
        response: { error: { code: 'NOTIFICATION_NOT_FOUND' } },
      });
      expect(prisma.reminder.update).not.toHaveBeenCalled();
    });

    it('throws notFound when the reminder belongs to another user', async () => {
      prisma.reminder.findUnique.mockResolvedValue({
        ...sentRow,
        userId: 'someone-else',
      });

      await expect(
        service.markAsRead('reminder-1', 'user-1', { isRead: true }),
      ).rejects.toMatchObject({
        response: { error: { code: 'NOTIFICATION_NOT_FOUND' } },
      });
    });

    it('throws notFound for an EMAIL-channel reminder', async () => {
      prisma.reminder.findUnique.mockResolvedValue({
        ...sentRow,
        channel: ReminderChannel.EMAIL,
      });

      await expect(
        service.markAsRead('reminder-1', 'user-1', { isRead: true }),
      ).rejects.toMatchObject({
        response: { error: { code: 'NOTIFICATION_NOT_FOUND' } },
      });
    });

    it('throws notFound for a reminder that has not fired yet', async () => {
      prisma.reminder.findUnique.mockResolvedValue({
        ...sentRow,
        sentAt: null,
      });

      await expect(
        service.markAsRead('reminder-1', 'user-1', { isRead: true }),
      ).rejects.toMatchObject({
        response: { error: { code: 'NOTIFICATION_NOT_FOUND' } },
      });
    });
  });

  describe('markAllAsRead', () => {
    it('marks every unread, fired, in-app notification read for the caller', async () => {
      prisma.reminder.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markAllAsRead('user-1');

      expect(prisma.reminder.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          channel: ReminderChannel.IN_APP,
          sentAt: { not: null },
          isRead: false,
        },
        data: { isRead: true },
      });
      expect(result).toBeNull();
    });
  });

  describe('dispatchDueReminders', () => {
    function buildCandidate(
      id: string,
      offsetMinutes: number,
      dueAt: Date,
      channel: ReminderChannel = ReminderChannel.IN_APP,
    ) {
      return {
        id,
        offsetMinutes,
        channel,
        deadline: { title: 'Essay', dueAt },
        user: { emailAddress: 'student@example.com' },
      };
    }

    it('marks a reminder sent once its offset has been crossed', async () => {
      // due at NOW + 30min, 60-minute-before offset -> already due
      const dueAt = new Date(NOW.getTime() + 30 * 60_000);
      prisma.reminder.findMany.mockResolvedValue([
        buildCandidate('reminder-1', 60, dueAt),
      ]);
      prisma.reminder.update.mockResolvedValue({});

      await service.dispatchDueReminders();

      expect(prisma.reminder.update).toHaveBeenCalledWith({
        where: { id: 'reminder-1' },
        data: { sentAt: NOW },
      });
    });

    it('leaves a reminder alone before its offset is crossed', async () => {
      // due at NOW + 2h, 60-minute-before offset -> not due yet
      const dueAt = new Date(NOW.getTime() + 2 * 60 * 60_000);
      prisma.reminder.findMany.mockResolvedValue([
        buildCandidate('reminder-1', 60, dueAt),
      ]);

      await service.dispatchDueReminders();

      expect(prisma.reminder.update).not.toHaveBeenCalled();
    });

    it('logs an email for EMAIL-channel reminders and still marks them sent', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const dueAt = new Date(NOW.getTime() + 30 * 60_000);
      prisma.reminder.findMany.mockResolvedValue([
        buildCandidate('reminder-1', 60, dueAt, ReminderChannel.EMAIL),
      ]);
      prisma.reminder.update.mockResolvedValue({});

      await service.dispatchDueReminders();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('student@example.com'),
      );
      expect(prisma.reminder.update).toHaveBeenCalledWith({
        where: { id: 'reminder-1' },
        data: { sentAt: NOW },
      });
      logSpy.mockRestore();
    });

    it('only considers unsent reminders on incomplete deadlines', async () => {
      prisma.reminder.findMany.mockResolvedValue([]);

      await service.dispatchDueReminders();

      expect(prisma.reminder.findMany).toHaveBeenCalledWith({
        where: { sentAt: null, deadline: { completedAt: null } },
        include: expect.any(Object),
      });
    });
  });
});
