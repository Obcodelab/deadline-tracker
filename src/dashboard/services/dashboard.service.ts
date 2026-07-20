import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CoursesService } from '../../courses/services/courses.service';
import { DashboardQueryDto } from '../dtos/dashboard-query.dto';
import {
  DashboardItemDto,
  DashboardResponseDto,
} from '../dtos/dashboard-response.dto';

const DASHBOARD_INCLUDE = {
  course: { select: { id: true, name: true, code: true, color: true } },
  checklistItems: { select: { isComplete: true } },
} satisfies Prisma.DeadlineInclude;

type DashboardDeadline = Prisma.DeadlineGetPayload<{
  include: typeof DASHBOARD_INCLUDE;
}>;

type DashboardBucket = 'overdue' | 'today' | 'thisWeek' | 'later';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coursesService: CoursesService,
  ) {}

  private splitDueAt(dueAt: Date): { dueDate: string; dueTime: string } {
    const iso = dueAt.toISOString();
    return {
      dueDate: iso.slice(0, 10),
      dueTime: iso.slice(11, 16),
    };
  }

  private getBucketBounds() {
    const now = new Date();
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const startOfTomorrow = new Date(
      startOfToday.getTime() + 24 * 60 * 60 * 1000,
    );
    const startOfLater = new Date(
      startOfToday.getTime() + 8 * 24 * 60 * 60 * 1000,
    );

    return { startOfToday, startOfTomorrow, startOfLater };
  }

  private bucketFor(dueAt: Date): DashboardBucket {
    const { startOfToday, startOfTomorrow, startOfLater } =
      this.getBucketBounds();

    if (dueAt < startOfToday) {
      return 'overdue';
    }
    if (dueAt < startOfTomorrow) {
      return 'today';
    }
    if (dueAt < startOfLater) {
      return 'thisWeek';
    }
    return 'later';
  }

  private toDashboardItem(deadline: DashboardDeadline): DashboardItemDto {
    const { dueDate, dueTime } = this.splitDueAt(deadline.dueAt);
    const completedCount = deadline.checklistItems.filter(
      (item) => item.isComplete,
    ).length;

    return plainToInstance(
      DashboardItemDto,
      {
        id: deadline.id,
        title: deadline.title,
        type: deadline.type,
        course: deadline.course,
        dueDate,
        dueTime,
        priority: deadline.priority,
        progress: {
          completed: completedCount,
          total: deadline.checklistItems.length,
        },
      },
      { excludeExtraneousValues: true },
    );
  }

  async getDashboard(userId: string, filters: DashboardQueryDto) {
    if (filters.course) {
      await this.coursesService.assertMember(filters.course, userId);
    }

    const where: Prisma.DeadlineWhereInput = {
      completedAt: null,
      course: filters.course
        ? { id: filters.course }
        : { members: { some: { userId } } },
    };

    if (filters.type) {
      where.type = filters.type;
    }

    const deadlines = await this.prisma.deadline.findMany({
      where,
      include: DASHBOARD_INCLUDE,
      orderBy: { dueAt: 'asc' },
    });

    const buckets: Record<DashboardBucket, DashboardItemDto[]> = {
      overdue: [],
      today: [],
      thisWeek: [],
      later: [],
    };

    for (const deadline of deadlines) {
      buckets[this.bucketFor(deadline.dueAt)].push(
        this.toDashboardItem(deadline),
      );
    }

    return plainToInstance(DashboardResponseDto, buckets, {
      excludeExtraneousValues: true,
    });
  }
}
