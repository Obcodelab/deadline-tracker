import { Test } from '@nestjs/testing';
import { DeadlineType, Priority } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { CoursesService } from '../../courses/services/courses.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createMockPrismaService,
  MockPrismaService,
} from '../../test/support/mock-prisma';

const NOW = new Date('2026-08-18T12:00:00.000Z');

function buildDeadline(
  id: string,
  dueAt: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    title: `Deadline ${id}`,
    type: DeadlineType.ASSIGNMENT,
    course: { id: 'course-1', name: 'English', code: 'EN101', color: '#fff' },
    dueAt: new Date(dueAt),
    priority: Priority.MEDIUM,
    completedAt: null,
    checklistItems: [],
    ...overrides,
  };
}

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: MockPrismaService;
  let coursesService: jest.Mocked<CoursesService>;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: CoursesService,
          useValue: { assertMember: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(DashboardService);
    coursesService = module.get(CoursesService);

    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('requires membership when filtering by a specific course', async () => {
    coursesService.assertMember.mockResolvedValue({} as never);
    prisma.deadline.findMany.mockResolvedValue([]);

    await service.getDashboard('user-1', { course: 'course-1' });

    expect(coursesService.assertMember).toHaveBeenCalledWith(
      'course-1',
      'user-1',
    );
    expect(prisma.deadline.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ course: { id: 'course-1' } }),
      }),
    );
  });

  it('scopes to the caller memberships when no course filter is given', async () => {
    prisma.deadline.findMany.mockResolvedValue([]);

    await service.getDashboard('user-1', {});

    expect(prisma.deadline.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          completedAt: null,
          course: { members: { some: { userId: 'user-1' } } },
        }),
      }),
    );
  });

  it('always excludes completed deadlines', async () => {
    prisma.deadline.findMany.mockResolvedValue([]);

    await service.getDashboard('user-1', {});

    expect(prisma.deadline.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ completedAt: null }),
      }),
    );
  });

  it('applies an optional type filter', async () => {
    prisma.deadline.findMany.mockResolvedValue([]);

    await service.getDashboard('user-1', { type: DeadlineType.EXAM });

    expect(prisma.deadline.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: DeadlineType.EXAM }),
      }),
    );
  });

  it('buckets deadlines into overdue / today / thisWeek / later', async () => {
    prisma.deadline.findMany.mockResolvedValue([
      buildDeadline('overdue-1', '2026-08-17T10:00:00.000Z'),
      buildDeadline('today-1', '2026-08-18T18:00:00.000Z'),
      buildDeadline('week-1', '2026-08-20T09:00:00.000Z'),
      buildDeadline('later-1', '2026-08-30T09:00:00.000Z'),
    ]);

    const result = await service.getDashboard('user-1', {});

    expect(result.overdue.map((i) => i.id)).toEqual(['overdue-1']);
    expect(result.today.map((i) => i.id)).toEqual(['today-1']);
    expect(result.thisWeek.map((i) => i.id)).toEqual(['week-1']);
    expect(result.later.map((i) => i.id)).toEqual(['later-1']);
  });

  it('treats the boundary just before "later" as thisWeek', async () => {
    // startOfLater = startOfToday + 8 days = 2026-08-26T00:00:00Z
    prisma.deadline.findMany.mockResolvedValue([
      buildDeadline('edge-1', '2026-08-25T23:59:59.999Z'),
    ]);

    const result = await service.getDashboard('user-1', {});

    expect(result.thisWeek.map((i) => i.id)).toEqual(['edge-1']);
    expect(result.later).toHaveLength(0);
  });

  it('computes checklist progress per item', async () => {
    prisma.deadline.findMany.mockResolvedValue([
      buildDeadline('today-1', '2026-08-18T18:00:00.000Z', {
        checklistItems: [{ isComplete: true }, { isComplete: false }],
      }),
    ]);

    const result = await service.getDashboard('user-1', {});

    expect(result.today[0]).toMatchObject({
      progress: { completed: 1, total: 2 },
    });
  });
});
