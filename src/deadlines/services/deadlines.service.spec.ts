import { Test } from '@nestjs/testing';
import { DeadlineType, Priority } from '@prisma/client';
import { DeadlinesService } from './deadlines.service';
import { CoursesService } from '../../courses/services/courses.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RemindersService } from '../../reminders/services/reminders.service';
import {
  createMockPrismaService,
  MockPrismaService,
} from '../../test/support/mock-prisma';

const NOW = new Date('2026-08-18T12:00:00.000Z');

function buildDeadline(overrides: Record<string, unknown> = {}) {
  return {
    id: 'deadline-1',
    title: 'Essay draft',
    type: DeadlineType.ASSIGNMENT,
    courseId: 'course-1',
    course: { id: 'course-1', name: 'English', code: 'EN101', color: '#fff' },
    dueAt: new Date('2026-08-20T10:00:00.000Z'),
    priority: Priority.MEDIUM,
    description: 'Draft the intro',
    completedAt: null,
    createdById: 'owner-1',
    checklistItems: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('DeadlinesService', () => {
  let service: DeadlinesService;
  let prisma: MockPrismaService;
  let coursesService: jest.Mocked<CoursesService>;
  let remindersService: jest.Mocked<RemindersService>;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module = await Test.createTestingModule({
      providers: [
        DeadlinesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: CoursesService,
          useValue: { assertOwner: jest.fn(), assertMember: jest.fn() },
        },
        {
          provide: RemindersService,
          useValue: {
            createRemindersForDeadline: jest.fn(),
            syncRemindersForDeadline: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(DeadlinesService);
    coursesService = module.get(CoursesService);
    remindersService = module.get(RemindersService);

    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('status computation (via findOne)', () => {
    it('marks a past-due, incomplete deadline as overdue', async () => {
      prisma.deadline.findUnique.mockResolvedValue(
        buildDeadline({ dueAt: new Date('2026-08-17T10:00:00.000Z') }),
      );

      const result = await service.findOne('deadline-1', 'user-1');

      expect(result.status).toBe('overdue');
    });

    it('marks a deadline due later today as due_today', async () => {
      prisma.deadline.findUnique.mockResolvedValue(
        buildDeadline({ dueAt: new Date('2026-08-18T18:00:00.000Z') }),
      );

      const result = await service.findOne('deadline-1', 'user-1');

      expect(result.status).toBe('due_today');
    });

    it('marks a future deadline as upcoming', async () => {
      prisma.deadline.findUnique.mockResolvedValue(
        buildDeadline({ dueAt: new Date('2026-08-25T10:00:00.000Z') }),
      );

      const result = await service.findOne('deadline-1', 'user-1');

      expect(result.status).toBe('upcoming');
    });

    it('marks a completed deadline as completed regardless of due date', async () => {
      prisma.deadline.findUnique.mockResolvedValue(
        buildDeadline({
          dueAt: new Date('2026-08-01T10:00:00.000Z'),
          completedAt: new Date('2026-08-05T10:00:00.000Z'),
        }),
      );

      const result = await service.findOne('deadline-1', 'user-1');

      expect(result.status).toBe('completed');
    });
  });

  describe('create', () => {
    const dto = {
      title: 'Essay draft',
      type: DeadlineType.ASSIGNMENT,
      courseId: 'course-1',
      dueDate: '2026-08-20',
      dueTime: '10:00',
      priority: Priority.MEDIUM,
      description: 'Draft the intro',
    };

    it('requires course ownership', async () => {
      coursesService.assertOwner.mockRejectedValue(new Error('not owner'));

      await expect(service.create('user-1', dto)).rejects.toThrow('not owner');
      expect(prisma.deadline.create).not.toHaveBeenCalled();
    });

    it('combines dueDate + dueTime into a UTC dueAt and creates checklist items', async () => {
      coursesService.assertOwner.mockResolvedValue(undefined);
      prisma.deadline.create.mockResolvedValue({ id: 'deadline-1' });
      prisma.checklistItem.createMany.mockResolvedValue({ count: 2 });
      prisma.deadline.findUniqueOrThrow.mockResolvedValue(buildDeadline());

      await service.create('user-1', {
        ...dto,
        checklistItems: [{ text: 'Outline' }, { text: 'Draft' }],
      });

      expect(prisma.deadline.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dueAt: new Date('2026-08-20T10:00:00.000Z'),
            createdById: 'user-1',
          }),
        }),
      );
      expect(prisma.checklistItem.createMany).toHaveBeenCalledWith({
        data: [
          { deadlineId: 'deadline-1', text: 'Outline', order: 0 },
          { deadlineId: 'deadline-1', text: 'Draft', order: 1 },
        ],
      });
    });

    it('returns the mapped response with nested course and progress', async () => {
      coursesService.assertOwner.mockResolvedValue(undefined);
      prisma.deadline.create.mockResolvedValue({ id: 'deadline-1' });
      prisma.deadline.findUniqueOrThrow.mockResolvedValue(
        buildDeadline({
          checklistItems: [
            { id: 'c1', text: 'Outline', isComplete: true, order: 0 },
            { id: 'c2', text: 'Draft', isComplete: false, order: 1 },
          ],
        }),
      );

      const result = await service.create('user-1', dto);

      expect(result).toMatchObject({
        id: 'deadline-1',
        course: { id: 'course-1', name: 'English' },
        progress: { completed: 1, total: 2 },
      });
      expect(remindersService.createRemindersForDeadline).toHaveBeenCalledWith(
        'deadline-1',
        'course-1',
      );
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.deadline.findMany.mockResolvedValue([]);
      prisma.deadline.count.mockResolvedValue(0);
    });

    it('requires membership when filtering by a specific course', async () => {
      coursesService.assertMember.mockResolvedValue({} as never);

      await service.findAll('user-1', { course: 'course-1' });

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
      await service.findAll('user-1', {});

      expect(prisma.deadline.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            course: { members: { some: { userId: 'user-1' } } },
          }),
        }),
      );
    });

    it('applies a case-insensitive title search filter', async () => {
      await service.findAll('user-1', { search: 'essay' });

      expect(prisma.deadline.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            title: { contains: 'essay', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('filters overdue status to incomplete deadlines due before today', async () => {
      await service.findAll('user-1', { status: 'overdue' });

      expect(prisma.deadline.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            completedAt: null,
            dueAt: { lt: new Date('2026-08-18T00:00:00.000Z') },
          }),
        }),
      );
    });

    it('filters completed status by completedAt not null', async () => {
      await service.findAll('user-1', { status: 'completed' });

      expect(prisma.deadline.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ completedAt: { not: null } }),
        }),
      );
    });

    it('applies from/to as a due-date range', async () => {
      await service.findAll('user-1', {
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-31T00:00:00.000Z',
      });

      expect(prisma.deadline.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dueAt: {
              gte: new Date('2026-08-01T00:00:00.000Z'),
              lte: new Date('2026-08-31T00:00:00.000Z'),
            },
          }),
        }),
      );
    });

    it('returns paginated items with a lightweight list shape', async () => {
      prisma.deadline.findMany.mockResolvedValue([
        buildDeadline({
          checklistItems: [{ isComplete: true }, { isComplete: false }],
        }),
      ]);
      prisma.deadline.count.mockResolvedValue(1);

      const result = await service.findAll('user-1', { page: 2, limit: 10 });

      expect(result.items[0]).toMatchObject({
        id: 'deadline-1',
        progress: { completed: 1, total: 2 },
      });
      expect(result.items[0]).not.toHaveProperty('description');
      expect(result.items[0]).not.toHaveProperty('checklistItems');
      expect(result.meta).toEqual({
        page: 2,
        limit: 10,
        total: 1,
        totalPages: 1,
      });
    });
  });

  describe('findOne', () => {
    it('throws notFound when the deadline does not exist', async () => {
      prisma.deadline.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing', 'user-1')).rejects.toMatchObject({
        response: { error: { code: 'DEADLINE_NOT_FOUND' } },
      });
    });

    it('requires course membership', async () => {
      prisma.deadline.findUnique.mockResolvedValue(buildDeadline());
      coursesService.assertMember.mockRejectedValue(new Error('not member'));

      await expect(service.findOne('deadline-1', 'user-1')).rejects.toThrow(
        'not member',
      );
    });
  });

  describe('update', () => {
    it('throws notFound when the deadline does not exist', async () => {
      prisma.deadline.findUnique.mockResolvedValue(null);

      await expect(
        service.update('missing', 'user-1', {}),
      ).rejects.toMatchObject({
        response: { error: { code: 'DEADLINE_NOT_FOUND' } },
      });
    });

    it('requires course ownership', async () => {
      prisma.deadline.findUnique.mockResolvedValue(buildDeadline());
      coursesService.assertOwner.mockRejectedValue(new Error('not owner'));

      await expect(service.update('deadline-1', 'user-1', {})).rejects.toThrow(
        'not owner',
      );
    });

    it('preserves the existing date half when only dueTime changes', async () => {
      prisma.deadline.findUnique.mockResolvedValue(
        buildDeadline({ dueAt: new Date('2026-08-20T10:00:00.000Z') }),
      );
      coursesService.assertOwner.mockResolvedValue(undefined);
      prisma.deadline.update.mockResolvedValue(buildDeadline());

      await service.update('deadline-1', 'user-1', { dueTime: '15:30' });

      expect(prisma.deadline.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dueAt: new Date('2026-08-20T15:30:00.000Z'),
          }),
        }),
      );
      expect(remindersService.syncRemindersForDeadline).toHaveBeenCalledWith(
        'deadline-1',
        'course-1',
        null,
      );
    });

    it('sets completedAt to a Date when marking complete', async () => {
      prisma.deadline.findUnique.mockResolvedValue(buildDeadline());
      coursesService.assertOwner.mockResolvedValue(undefined);
      const completedAt = new Date('2026-08-18T12:00:00.000Z');
      prisma.deadline.update.mockResolvedValue(buildDeadline({ completedAt }));

      await service.update('deadline-1', 'user-1', { completed: true });

      expect(prisma.deadline.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ completedAt: expect.any(Date) }),
        }),
      );
      expect(remindersService.syncRemindersForDeadline).toHaveBeenCalledWith(
        'deadline-1',
        'course-1',
        completedAt,
      );
    });

    it('clears completedAt when marking incomplete', async () => {
      prisma.deadline.findUnique.mockResolvedValue(buildDeadline());
      coursesService.assertOwner.mockResolvedValue(undefined);
      prisma.deadline.update.mockResolvedValue(buildDeadline());

      await service.update('deadline-1', 'user-1', { completed: false });

      expect(prisma.deadline.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ completedAt: null }),
        }),
      );
      expect(remindersService.syncRemindersForDeadline).toHaveBeenCalledWith(
        'deadline-1',
        'course-1',
        null,
      );
    });

    it('leaves completedAt untouched and does not resync reminders for an unrelated field edit', async () => {
      prisma.deadline.findUnique.mockResolvedValue(buildDeadline());
      coursesService.assertOwner.mockResolvedValue(undefined);
      prisma.deadline.update.mockResolvedValue(buildDeadline());

      await service.update('deadline-1', 'user-1', { title: 'New title' });

      expect(prisma.deadline.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ completedAt: undefined }),
        }),
      );
      expect(remindersService.syncRemindersForDeadline).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws notFound when the deadline does not exist', async () => {
      prisma.deadline.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing', 'user-1')).rejects.toMatchObject({
        response: { error: { code: 'DEADLINE_NOT_FOUND' } },
      });
    });

    it('requires course ownership then deletes', async () => {
      prisma.deadline.findUnique.mockResolvedValue(buildDeadline());
      coursesService.assertOwner.mockResolvedValue(undefined);
      prisma.deadline.delete.mockResolvedValue(buildDeadline());

      const result = await service.remove('deadline-1', 'user-1');

      expect(coursesService.assertOwner).toHaveBeenCalledWith(
        'course-1',
        'user-1',
      );
      expect(prisma.deadline.delete).toHaveBeenCalledWith({
        where: { id: 'deadline-1' },
      });
      expect(result).toBeNull();
    });
  });

  describe('addChecklistItem', () => {
    it('throws notFound when the deadline does not exist', async () => {
      prisma.deadline.findUnique.mockResolvedValue(null);

      await expect(
        service.addChecklistItem('missing', 'user-1', { text: 'Step' }),
      ).rejects.toMatchObject({
        response: { error: { code: 'DEADLINE_NOT_FOUND' } },
      });
    });

    it('orders a first checklist item at 0 when none exist yet', async () => {
      prisma.deadline.findUnique.mockResolvedValue(buildDeadline());
      coursesService.assertOwner.mockResolvedValue(undefined);
      prisma.checklistItem.findFirst.mockResolvedValue(null);
      prisma.checklistItem.create.mockResolvedValue({});
      prisma.deadline.findUniqueOrThrow.mockResolvedValue(buildDeadline());

      await service.addChecklistItem('deadline-1', 'user-1', {
        text: 'Step 1',
      });

      expect(prisma.checklistItem.create).toHaveBeenCalledWith({
        data: { deadlineId: 'deadline-1', text: 'Step 1', order: 0 },
      });
    });

    it('appends after the last existing order', async () => {
      prisma.deadline.findUnique.mockResolvedValue(buildDeadline());
      coursesService.assertOwner.mockResolvedValue(undefined);
      prisma.checklistItem.findFirst.mockResolvedValue({ order: 3 });
      prisma.checklistItem.create.mockResolvedValue({});
      prisma.deadline.findUniqueOrThrow.mockResolvedValue(buildDeadline());

      await service.addChecklistItem('deadline-1', 'user-1', {
        text: 'Step 2',
      });

      expect(prisma.checklistItem.create).toHaveBeenCalledWith({
        data: { deadlineId: 'deadline-1', text: 'Step 2', order: 4 },
      });
    });
  });

  describe('removeChecklistItem', () => {
    it('throws checklistItemNotFound when the item does not exist', async () => {
      prisma.checklistItem.findUnique.mockResolvedValue(null);

      await expect(
        service.removeChecklistItem('missing', 'user-1'),
      ).rejects.toMatchObject({
        response: { error: { code: 'CHECKLIST_ITEM_NOT_FOUND' } },
      });
    });

    it('requires ownership of the parent deadline before deleting', async () => {
      prisma.checklistItem.findUnique.mockResolvedValue({
        id: 'item-1',
        deadlineId: 'deadline-1',
        deadline: { courseId: 'course-1' },
      });
      coursesService.assertOwner.mockRejectedValue(new Error('not owner'));

      await expect(
        service.removeChecklistItem('item-1', 'user-1'),
      ).rejects.toThrow('not owner');
      expect(prisma.checklistItem.delete).not.toHaveBeenCalled();
    });

    it('deletes the item and returns the refreshed deadline', async () => {
      prisma.checklistItem.findUnique.mockResolvedValue({
        id: 'item-1',
        deadlineId: 'deadline-1',
        deadline: { courseId: 'course-1' },
      });
      coursesService.assertOwner.mockResolvedValue(undefined);
      prisma.checklistItem.delete.mockResolvedValue({});
      prisma.deadline.findUniqueOrThrow.mockResolvedValue(buildDeadline());

      const result = await service.removeChecklistItem('item-1', 'user-1');

      expect(prisma.checklistItem.delete).toHaveBeenCalledWith({
        where: { id: 'item-1' },
      });
      expect(result).toMatchObject({ id: 'deadline-1' });
    });
  });

  describe('toggleChecklistItem', () => {
    it('throws checklistItemNotFound when the item does not exist', async () => {
      prisma.checklistItem.findUnique.mockResolvedValue(null);

      await expect(
        service.toggleChecklistItem('missing', 'user-1', {
          isComplete: true,
        }),
      ).rejects.toMatchObject({
        response: { error: { code: 'CHECKLIST_ITEM_NOT_FOUND' } },
      });
    });

    it('only requires membership, not ownership, to check off an item', async () => {
      prisma.checklistItem.findUnique.mockResolvedValue({
        id: 'item-1',
        deadlineId: 'deadline-1',
        deadline: { courseId: 'course-1' },
      });
      coursesService.assertMember.mockResolvedValue({} as never);
      prisma.checklistItem.update.mockResolvedValue({
        id: 'item-1',
        isComplete: true,
      });
      prisma.checklistItem.findMany.mockResolvedValue([
        { isComplete: true },
        { isComplete: false },
      ]);

      const result = await service.toggleChecklistItem('item-1', 'user-1', {
        isComplete: true,
      });

      expect(coursesService.assertMember).toHaveBeenCalledWith(
        'course-1',
        'user-1',
      );
      expect(coursesService.assertOwner).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        progress: { completed: 1, total: 2 },
      });
    });
  });
});
