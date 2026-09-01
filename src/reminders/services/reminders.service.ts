import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { plainToInstance } from 'class-transformer';
import { Prisma, ReminderChannel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationErrors } from '../../common/app.errors';
import {
  buildPaginationMeta,
  getPaginationParams,
} from '../../common/pagination.util';
import { NotificationResponseDto } from '../dtos/notification-response.dto';
import {
  ListNotificationsQueryDto,
  MarkNotificationReadDto,
} from '../dtos/notification.dto';

const DEFAULT_OFFSET_MINUTES = [1440, 60];

const NOTIFICATION_INCLUDE = {
  deadline: {
    select: {
      id: true,
      title: true,
      dueAt: true,
      course: { select: { id: true, name: true, code: true, color: true } },
    },
  },
} satisfies Prisma.ReminderInclude;

type NotificationRow = Prisma.ReminderGetPayload<{
  include: typeof NOTIFICATION_INCLUDE;
}>;

const DISPATCH_INCLUDE = {
  deadline: { select: { title: true, dueAt: true } },
  user: { select: { emailAddress: true } },
} satisfies Prisma.ReminderInclude;

type DispatchRow = Prisma.ReminderGetPayload<{
  include: typeof DISPATCH_INCLUDE;
}>;

function reminderRows(
  deadlineIds: string[],
  userId: string,
  channels: ReminderChannel[],
) {
  return deadlineIds.flatMap((deadlineId) =>
    DEFAULT_OFFSET_MINUTES.flatMap((offsetMinutes) =>
      channels.map((channel) => ({
        deadlineId,
        userId,
        offsetMinutes,
        channel,
      })),
    ),
  );
}

@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService) {}

  private splitDueAt(dueAt: Date): { dueDate: string; dueTime: string } {
    const iso = dueAt.toISOString();
    return { dueDate: iso.slice(0, 10), dueTime: iso.slice(11, 16) };
  }

  private toNotificationDto(row: NotificationRow): NotificationResponseDto {
    const { dueDate, dueTime } = this.splitDueAt(row.deadline.dueAt);

    return plainToInstance(
      NotificationResponseDto,
      {
        id: row.id,
        offsetMinutes: row.offsetMinutes,
        sentAt: row.sentAt,
        isRead: row.isRead,
        deadline: { ...row.deadline, dueDate, dueTime },
      },
      { excludeExtraneousValues: true },
    );
  }

  /**
   * Default 24h/1h reminders for every current member of the deadline's
   * course, on whichever channel(s) each member has chosen.
   */
  async createRemindersForDeadline(deadlineId: string, courseId: string) {
    const members = await this.prisma.courseMember.findMany({
      where: { courseId },
      select: { userId: true, user: { select: { reminderChannels: true } } },
    });

    await Promise.all(
      members
        .filter((member) => member.user.reminderChannels.length > 0)
        .map((member) =>
          this.prisma.reminder.createMany({
            data: reminderRows(
              [deadlineId],
              member.userId,
              member.user.reminderChannels,
            ),
            skipDuplicates: true,
          }),
        ),
    );
  }

  /** Backfills reminders for a member joining a course with deadlines already in it. */
  async createRemindersForNewMember(courseId: string, userId: string) {
    const [deadlines, user] = await Promise.all([
      this.prisma.deadline.findMany({
        where: { courseId, completedAt: null, dueAt: { gt: new Date() } },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { reminderChannels: true },
      }),
    ]);

    if (!deadlines.length || !user?.reminderChannels.length) {
      return;
    }

    await this.prisma.reminder.createMany({
      data: reminderRows(
        deadlines.map((deadline) => deadline.id),
        userId,
        user.reminderChannels,
      ),
      skipDuplicates: true,
    });
  }

  /**
   * Clears not-yet-sent reminders for a deadline and, if it's still
   * incomplete, regenerates them against its current due date — used
   * whenever a deadline's due date or completion state changes.
   */
  async syncRemindersForDeadline(
    deadlineId: string,
    courseId: string,
    completedAt: Date | null,
  ) {
    await this.prisma.reminder.deleteMany({
      where: { deadlineId, sentAt: null },
    });

    if (!completedAt) {
      await this.createRemindersForDeadline(deadlineId, courseId);
    }
  }

  async getNotifications(
    userId: string,
    pagination: ListNotificationsQueryDto,
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const { skip, take } = getPaginationParams(page, limit);

    const where: Prisma.ReminderWhereInput = {
      userId,
      channel: ReminderChannel.IN_APP,
      sentAt: { not: null },
      ...(pagination.unread ? { isRead: false } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.reminder.findMany({
        where,
        include: NOTIFICATION_INCLUDE,
        orderBy: { sentAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.reminder.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toNotificationDto(row)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async markAsRead(
    id: string,
    userId: string,
    dto: MarkNotificationReadDto,
  ): Promise<NotificationResponseDto> {
    const reminder = await this.prisma.reminder.findUnique({ where: { id } });

    if (
      !reminder ||
      reminder.userId !== userId ||
      reminder.channel !== ReminderChannel.IN_APP ||
      !reminder.sentAt
    ) {
      throw NotificationErrors.notFound();
    }

    const updated = await this.prisma.reminder.update({
      where: { id },
      data: { isRead: dto.isRead },
      include: NOTIFICATION_INCLUDE,
    });

    return this.toNotificationDto(updated);
  }

  async markAllAsRead(userId: string): Promise<null> {
    await this.prisma.reminder.updateMany({
      where: {
        userId,
        channel: ReminderChannel.IN_APP,
        sentAt: { not: null },
        isRead: false,
      },
      data: { isRead: true },
    });

    return null;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async dispatchDueReminders(): Promise<void> {
    const now = new Date();

    const candidates = await this.prisma.reminder.findMany({
      where: { sentAt: null, deadline: { completedAt: null } },
      include: DISPATCH_INCLUDE,
    });

    const due = candidates.filter(
      (reminder: DispatchRow) =>
        reminder.deadline.dueAt.getTime() - reminder.offsetMinutes * 60_000 <=
        now.getTime(),
    );

    for (const reminder of due) {
      if (reminder.channel === ReminderChannel.EMAIL) {
        console.log(`
          ====================================
          DEADLINE REMINDER EMAIL

          To  : ${reminder.user.emailAddress}
          Task: ${reminder.deadline.title}
          Due : ${reminder.deadline.dueAt.toISOString()}
          ====================================
        `);
      }

      await this.prisma.reminder.update({
        where: { id: reminder.id },
        data: { sentAt: now },
      });
    }
  }
}
