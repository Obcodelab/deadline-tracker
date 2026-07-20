import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CoursesService } from '../../courses/services/courses.service';
import {
  CreateChecklistItemDto,
  CreateDeadlineDto,
  ListDeadlinesQueryDto,
  ToggleChecklistItemDto,
  UpdateDeadlineDto,
} from '../dtos/deadline.dto';
import {
  ChecklistToggleResponseDto,
  DeadlineListItemResponseDto,
  DeadlineResponseDto,
  DeadlineStatus,
} from '../dtos/deadline-response.dto';
import { DeadlineErrors } from '../../common/app.errors';
import { buildPaginationMeta, getPaginationParams } from '../../common/pagination.util';

const DEADLINE_INCLUDE = {
  course: { select: { id: true, name: true, code: true, color: true } },
  checklistItems: { orderBy: { order: 'asc' as const } },
} satisfies Prisma.DeadlineInclude;

type DeadlineWithChecklist = Prisma.DeadlineGetPayload<{
  include: typeof DEADLINE_INCLUDE;
}>;

const LIST_INCLUDE = {
  course: { select: { id: true, name: true, code: true, color: true } },
  checklistItems: { select: { isComplete: true } },
} satisfies Prisma.DeadlineInclude;

type DeadlineListRow = Prisma.DeadlineGetPayload<{
  include: typeof LIST_INCLUDE;
}>;

@Injectable()
export class DeadlinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coursesService: CoursesService,
  ) {}

  private combineDueAt(dueDate: string, dueTime: string): Date {
    return new Date(`${dueDate}T${dueTime}:00.000Z`);
  }

  private splitDueAt(dueAt: Date): { dueDate: string; dueTime: string } {
    const iso = dueAt.toISOString();
    return {
      dueDate: iso.slice(0, 10),
      dueTime: iso.slice(11, 16),
    };
  }

  private getTodayBounds() {
    const now = new Date();
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const startOfTomorrow = new Date(
      startOfToday.getTime() + 24 * 60 * 60 * 1000,
    );

    return { startOfToday, startOfTomorrow };
  }

  private computeStatus(dueAt: Date, completedAt: Date | null): DeadlineStatus {
    if (completedAt) {
      return 'completed';
    }

    const { startOfToday, startOfTomorrow } = this.getTodayBounds();

    if (dueAt < startOfToday) {
      return 'overdue';
    }
    if (dueAt < startOfTomorrow) {
      return 'due_today';
    }
    return 'upcoming';
  }

  private toResponseDto(deadline: DeadlineWithChecklist): DeadlineResponseDto {
    const { dueDate, dueTime } = this.splitDueAt(deadline.dueAt);
    const completedCount = deadline.checklistItems.filter(
      (item) => item.isComplete,
    ).length;

    return plainToInstance(
      DeadlineResponseDto,
      {
        id: deadline.id,
        title: deadline.title,
        type: deadline.type,
        course: deadline.course,
        dueDate,
        dueTime,
        priority: deadline.priority,
        description: deadline.description,
        status: this.computeStatus(deadline.dueAt, deadline.completedAt),
        progress: {
          completed: completedCount,
          total: deadline.checklistItems.length,
        },
        checklistItems: deadline.checklistItems,
        createdById: deadline.createdById,
        createdAt: deadline.createdAt,
        updatedAt: deadline.updatedAt,
      },
      { excludeExtraneousValues: true },
    );
  }

  private toListItemDto(deadline: DeadlineListRow): DeadlineListItemResponseDto {
    const { dueDate, dueTime } = this.splitDueAt(deadline.dueAt);
    const completedCount = deadline.checklistItems.filter(
      (item) => item.isComplete,
    ).length;

    return plainToInstance(
      DeadlineListItemResponseDto,
      {
        id: deadline.id,
        title: deadline.title,
        type: deadline.type,
        course: deadline.course,
        dueDate,
        dueTime,
        priority: deadline.priority,
        status: this.computeStatus(deadline.dueAt, deadline.completedAt),
        progress: {
          completed: completedCount,
          total: deadline.checklistItems.length,
        },
      },
      { excludeExtraneousValues: true },
    );
  }

  async create(userId: string, dto: CreateDeadlineDto) {
    await this.coursesService.assertOwner(dto.courseId, userId);

    const deadline = await this.prisma.$transaction(async (tx) => {
      const created = await tx.deadline.create({
        data: {
          title: dto.title,
          type: dto.type,
          courseId: dto.courseId,
          dueAt: this.combineDueAt(dto.dueDate, dto.dueTime),
          priority: dto.priority,
          description: dto.description,
          createdById: userId,
        },
      });

      if (dto.checklistItems?.length) {
        await tx.checklistItem.createMany({
          data: dto.checklistItems.map((item, index) => ({
            deadlineId: created.id,
            text: item.text,
            order: index,
          })),
        });
      }

      return tx.deadline.findUniqueOrThrow({
        where: { id: created.id },
        include: DEADLINE_INCLUDE,
      });
    });

    return this.toResponseDto(deadline);
  }

  async findAll(userId: string, filters: ListDeadlinesQueryDto) {
    if (filters.course) {
      await this.coursesService.assertMember(filters.course, userId);
    }

    const where: Prisma.DeadlineWhereInput = {
      course: filters.course
        ? { id: filters.course }
        : { members: { some: { userId } } },
    };

    if (filters.type) {
      where.type = filters.type;
    }

    if (filters.search) {
      where.title = { contains: filters.search, mode: 'insensitive' };
    }

    const dueAtFilter: Prisma.DateTimeFilter = {};

    if (filters.status) {
      if (filters.status === 'completed') {
        where.completedAt = { not: null };
      } else {
        where.completedAt = null;

        const { startOfToday, startOfTomorrow } = this.getTodayBounds();
        if (filters.status === 'overdue') {
          dueAtFilter.lt = startOfToday;
        } else if (filters.status === 'due_today') {
          dueAtFilter.gte = startOfToday;
          dueAtFilter.lt = startOfTomorrow;
        } else if (filters.status === 'upcoming') {
          dueAtFilter.gte = startOfTomorrow;
        }
      }
    }

    if (filters.from) {
      dueAtFilter.gte = new Date(filters.from);
    }

    if (filters.to) {
      dueAtFilter.lte = new Date(filters.to);
    }

    if (Object.keys(dueAtFilter).length > 0) {
      where.dueAt = dueAtFilter;
    }

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { skip, take } = getPaginationParams(page, limit);

    const [deadlines, total] = await this.prisma.$transaction([
      this.prisma.deadline.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: { dueAt: 'asc' },
        skip,
        take,
      }),
      this.prisma.deadline.count({ where }),
    ]);

    return {
      items: deadlines.map((deadline) => this.toListItemDto(deadline)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async findOne(deadlineId: string, userId: string) {
    const deadline = await this.prisma.deadline.findUnique({
      where: { id: deadlineId },
      include: DEADLINE_INCLUDE,
    });

    if (!deadline) {
      throw DeadlineErrors.notFound();
    }

    await this.coursesService.assertMember(deadline.courseId, userId);

    return this.toResponseDto(deadline);
  }

  async update(deadlineId: string, userId: string, dto: UpdateDeadlineDto) {
    const deadline = await this.prisma.deadline.findUnique({
      where: { id: deadlineId },
    });

    if (!deadline) {
      throw DeadlineErrors.notFound();
    }

    await this.coursesService.assertOwner(deadline.courseId, userId);

    let dueAt: Date | undefined;
    if (dto.dueDate || dto.dueTime) {
      const existing = this.splitDueAt(deadline.dueAt);
      dueAt = this.combineDueAt(
        dto.dueDate ?? existing.dueDate,
        dto.dueTime ?? existing.dueTime,
      );
    }

    const updated = await this.prisma.deadline.update({
      where: { id: deadlineId },
      data: {
        title: dto.title,
        type: dto.type,
        priority: dto.priority,
        description: dto.description,
        dueAt,
        completedAt:
          dto.completed === undefined
            ? undefined
            : dto.completed
              ? new Date()
              : null,
      },
      include: DEADLINE_INCLUDE,
    });

    return this.toResponseDto(updated);
  }

  async remove(deadlineId: string, userId: string) {
    const deadline = await this.prisma.deadline.findUnique({
      where: { id: deadlineId },
    });

    if (!deadline) {
      throw DeadlineErrors.notFound();
    }

    await this.coursesService.assertOwner(deadline.courseId, userId);

    await this.prisma.deadline.delete({ where: { id: deadlineId } });

    return null;
  }

  async addChecklistItem(
    deadlineId: string,
    userId: string,
    dto: CreateChecklistItemDto,
  ) {
    const deadline = await this.prisma.deadline.findUnique({
      where: { id: deadlineId },
    });

    if (!deadline) {
      throw DeadlineErrors.notFound();
    }

    await this.coursesService.assertOwner(deadline.courseId, userId);

    const lastItem = await this.prisma.checklistItem.findFirst({
      where: { deadlineId },
      orderBy: { order: 'desc' },
    });

    await this.prisma.checklistItem.create({
      data: {
        deadlineId,
        text: dto.text,
        order: (lastItem?.order ?? -1) + 1,
      },
    });

    const updated = await this.prisma.deadline.findUniqueOrThrow({
      where: { id: deadlineId },
      include: DEADLINE_INCLUDE,
    });

    return this.toResponseDto(updated);
  }

  async removeChecklistItem(itemId: string, userId: string) {
    const item = await this.prisma.checklistItem.findUnique({
      where: { id: itemId },
      include: { deadline: true },
    });

    if (!item) {
      throw DeadlineErrors.checklistItemNotFound();
    }

    await this.coursesService.assertOwner(item.deadline.courseId, userId);

    await this.prisma.checklistItem.delete({ where: { id: itemId } });

    const updated = await this.prisma.deadline.findUniqueOrThrow({
      where: { id: item.deadlineId },
      include: DEADLINE_INCLUDE,
    });

    return this.toResponseDto(updated);
  }

  async toggleChecklistItem(
    itemId: string,
    userId: string,
    dto: ToggleChecklistItemDto,
  ) {
    const item = await this.prisma.checklistItem.findUnique({
      where: { id: itemId },
      include: { deadline: true },
    });

    if (!item) {
      throw DeadlineErrors.checklistItemNotFound();
    }

    await this.coursesService.assertMember(item.deadline.courseId, userId);

    const updatedItem = await this.prisma.checklistItem.update({
      where: { id: itemId },
      data: { isComplete: dto.isComplete },
    });

    const allItems = await this.prisma.checklistItem.findMany({
      where: { deadlineId: item.deadlineId },
    });

    const completedCount = allItems.filter((i) => i.isComplete).length;

    return plainToInstance(
      ChecklistToggleResponseDto,
      {
        item: updatedItem,
        progress: {
          completed: completedCount,
          total: allItems.length,
        },
      },
      { excludeExtraneousValues: true },
    );
  }
}
