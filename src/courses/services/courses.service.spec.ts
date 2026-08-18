import { Test } from '@nestjs/testing';
import { AcademicTerm, CourseRole } from '@prisma/client';
import { CoursesService } from './courses.service';
import { UsersService } from '../../users/services/users.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  createMockPrismaService,
  MockPrismaService,
} from '../../test/support/mock-prisma';

function buildCourse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'course-1',
    name: 'Data Structures',
    code: 'CS201',
    term: AcademicTerm.FIRST_SEMESTER,
    color: '#3366ff',
    joinCode: 'ABCD2345',
    archived: false,
    ownerId: 'owner-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('CoursesService', () => {
  let service: CoursesService;
  let prisma: MockPrismaService;
  let usersService: jest.Mocked<UsersService>;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module = await Test.createTestingModule({
      providers: [
        CoursesService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: { findById: jest.fn() } },
      ],
    }).compile();

    service = module.get(CoursesService);
    usersService = module.get(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('assertOwner / assertMember', () => {
    it('assertOwner throws notOwner when there is no membership', async () => {
      prisma.courseMember.findUnique.mockResolvedValue(null);

      await expect(
        service.assertOwner('course-1', 'user-1'),
      ).rejects.toMatchObject({
        response: { error: { code: 'NOT_COURSE_OWNER' } },
      });
    });

    it('assertOwner throws notOwner for a member (non-owner) role', async () => {
      prisma.courseMember.findUnique.mockResolvedValue({
        role: CourseRole.MEMBER,
      });

      await expect(
        service.assertOwner('course-1', 'user-1'),
      ).rejects.toMatchObject({
        response: { error: { code: 'NOT_COURSE_OWNER' } },
      });
    });

    it('assertOwner resolves for the owner', async () => {
      prisma.courseMember.findUnique.mockResolvedValue({
        role: CourseRole.OWNER,
      });

      await expect(
        service.assertOwner('course-1', 'user-1'),
      ).resolves.toBeUndefined();
    });

    it('assertMember throws notMember when there is no membership', async () => {
      prisma.courseMember.findUnique.mockResolvedValue(null);

      await expect(
        service.assertMember('course-1', 'user-1'),
      ).rejects.toMatchObject({
        response: { error: { code: 'NOT_COURSE_MEMBER' } },
      });
    });
  });

  describe('create', () => {
    const dto = {
      name: 'Data Structures',
      code: 'CS201',
      term: AcademicTerm.FIRST_SEMESTER,
      color: '#3366ff',
    };

    it('throws emailNotVerified when the owner is unverified', async () => {
      usersService.findById.mockResolvedValue({
        isEmailVerified: false,
      } as never);

      await expect(service.create('owner-1', dto)).rejects.toMatchObject({
        response: { error: { code: 'EMAIL_NOT_VERIFIED' } },
      });
    });

    it('throws codeAlreadyExists when the owner already used this code', async () => {
      usersService.findById.mockResolvedValue({
        isEmailVerified: true,
      } as never);
      prisma.course.findUnique.mockResolvedValue(buildCourse());

      await expect(service.create('owner-1', dto)).rejects.toMatchObject({
        response: { error: { code: 'COURSE_CODE_ALREADY_EXISTS' } },
      });
    });

    it('gives up after exhausting join code generation attempts', async () => {
      usersService.findById.mockResolvedValue({
        isEmailVerified: true,
      } as never);
      prisma.course.findUnique
        .mockResolvedValueOnce(null) // ownerId_code uniqueness check
        .mockResolvedValue(buildCourse()); // every join-code candidate collides

      await expect(service.create('owner-1', dto)).rejects.toThrow(
        'Failed to generate a unique join code.',
      );
    });

    it('creates the course and an OWNER membership in a transaction', async () => {
      usersService.findById.mockResolvedValue({
        isEmailVerified: true,
      } as never);
      prisma.course.findUnique
        .mockResolvedValueOnce(null) // ownerId_code uniqueness check
        .mockResolvedValueOnce(null); // join-code candidate is unique
      prisma.course.create.mockResolvedValue(buildCourse());
      prisma.courseMember.create.mockResolvedValue({});

      const result = await service.create('owner-1', dto);

      expect(prisma.course.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ownerId: 'owner-1' }),
        }),
      );
      expect(prisma.courseMember.create).toHaveBeenCalledWith({
        data: {
          courseId: 'course-1',
          userId: 'owner-1',
          role: CourseRole.OWNER,
        },
      });
      expect(result).toMatchObject({ id: 'course-1', code: 'CS201' });
    });
  });

  describe('findAllForUser', () => {
    it('paginates and maps membership + course counts', async () => {
      prisma.courseMember.findMany.mockResolvedValue([
        {
          role: CourseRole.OWNER,
          course: {
            ...buildCourse(),
            _count: { members: 3, deadlines: 5 },
          },
        },
      ]);
      prisma.courseMember.count.mockResolvedValue(1);

      const result = await service.findAllForUser('user-1', {
        page: 1,
        limit: 20,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: 'course-1',
        role: CourseRole.OWNER,
        memberCount: 3,
        deadlineCount: 5,
      });
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });
  });

  describe('findOne', () => {
    it('throws notMember when the requester has no membership', async () => {
      prisma.courseMember.findUnique.mockResolvedValue(null);

      await expect(service.findOne('course-1', 'user-1')).rejects.toMatchObject(
        { response: { error: { code: 'NOT_COURSE_MEMBER' } } },
      );
    });

    it('throws notFound when the course record is missing', async () => {
      prisma.courseMember.findUnique.mockResolvedValue({
        role: CourseRole.MEMBER,
      });
      prisma.course.findUnique.mockResolvedValue(null);

      await expect(service.findOne('course-1', 'user-1')).rejects.toMatchObject(
        { response: { error: { code: 'COURSE_NOT_FOUND' } } },
      );
    });

    it('returns the mapped course with the caller role and counts', async () => {
      prisma.courseMember.findUnique.mockResolvedValue({
        role: CourseRole.MEMBER,
      });
      prisma.course.findUnique.mockResolvedValue({
        ...buildCourse(),
        _count: { members: 2, deadlines: 4 },
      });

      const result = await service.findOne('course-1', 'user-1');

      expect(result).toMatchObject({
        id: 'course-1',
        role: CourseRole.MEMBER,
        memberCount: 2,
        deadlineCount: 4,
      });
    });
  });

  describe('update', () => {
    it('throws notOwner for a non-owner', async () => {
      prisma.courseMember.findUnique.mockResolvedValue(null);

      await expect(
        service.update('course-1', 'user-1', { name: 'New name' }),
      ).rejects.toMatchObject({
        response: { error: { code: 'NOT_COURSE_OWNER' } },
      });
    });

    it('throws codeAlreadyExists when another course owns the new code', async () => {
      prisma.courseMember.findUnique.mockResolvedValue({
        role: CourseRole.OWNER,
      });
      prisma.course.findUnique.mockResolvedValue(
        buildCourse({ id: 'other-course' }),
      );

      await expect(
        service.update('course-1', 'user-1', { code: 'CS202' }),
      ).rejects.toMatchObject({
        response: { error: { code: 'COURSE_CODE_ALREADY_EXISTS' } },
      });
    });

    it('allows keeping the same code on the same course', async () => {
      prisma.courseMember.findUnique.mockResolvedValue({
        role: CourseRole.OWNER,
      });
      prisma.course.findUnique.mockResolvedValue(buildCourse());
      prisma.course.update.mockResolvedValue(buildCourse({ code: 'CS201' }));

      await expect(
        service.update('course-1', 'user-1', { code: 'CS201' }),
      ).resolves.toMatchObject({ code: 'CS201' });
    });

    it('archives a course via the archived flag', async () => {
      prisma.courseMember.findUnique.mockResolvedValue({
        role: CourseRole.OWNER,
      });
      prisma.course.update.mockResolvedValue(buildCourse({ archived: true }));

      const result = await service.update('course-1', 'user-1', {
        archived: true,
      });

      expect(prisma.course.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { archived: true } }),
      );
      expect(result).toMatchObject({ archived: true });
    });
  });

  describe('remove', () => {
    it('throws notOwner for a non-owner', async () => {
      prisma.courseMember.findUnique.mockResolvedValue(null);

      await expect(service.remove('course-1', 'user-1')).rejects.toMatchObject({
        response: { error: { code: 'NOT_COURSE_OWNER' } },
      });
    });

    it('throws hasLinkedDeadlines when deadlines still reference the course', async () => {
      prisma.courseMember.findUnique.mockResolvedValue({
        role: CourseRole.OWNER,
      });
      prisma.deadline.count.mockResolvedValue(2);

      await expect(service.remove('course-1', 'user-1')).rejects.toMatchObject({
        response: { error: { code: 'COURSE_HAS_LINKED_DEADLINES' } },
      });
      expect(prisma.course.delete).not.toHaveBeenCalled();
    });

    it('deletes the course when there are no linked deadlines', async () => {
      prisma.courseMember.findUnique.mockResolvedValue({
        role: CourseRole.OWNER,
      });
      prisma.deadline.count.mockResolvedValue(0);
      prisma.course.delete.mockResolvedValue(buildCourse());

      const result = await service.remove('course-1', 'user-1');

      expect(prisma.course.delete).toHaveBeenCalledWith({
        where: { id: 'course-1' },
      });
      expect(result).toBeNull();
    });
  });

  describe('join', () => {
    it('throws emailNotVerified when the joiner is unverified', async () => {
      usersService.findById.mockResolvedValue({
        isEmailVerified: false,
      } as never);

      await expect(
        service.join('user-1', { joinCode: 'ABCD2345' }),
      ).rejects.toMatchObject({
        response: { error: { code: 'EMAIL_NOT_VERIFIED' } },
      });
    });

    it('throws invalidJoinCode when no course matches the code', async () => {
      usersService.findById.mockResolvedValue({
        isEmailVerified: true,
      } as never);
      prisma.course.findUnique.mockResolvedValue(null);

      await expect(
        service.join('user-1', { joinCode: 'BADCODE1' }),
      ).rejects.toMatchObject({
        response: { error: { code: 'INVALID_JOIN_CODE' } },
      });
    });

    it('throws alreadyMember when the user has already joined', async () => {
      usersService.findById.mockResolvedValue({
        isEmailVerified: true,
      } as never);
      prisma.course.findUnique.mockResolvedValue(buildCourse());
      prisma.courseMember.findUnique.mockResolvedValue({
        role: CourseRole.MEMBER,
      });

      await expect(
        service.join('user-1', { joinCode: 'ABCD2345' }),
      ).rejects.toMatchObject({
        response: { error: { code: 'ALREADY_COURSE_MEMBER' } },
      });
    });

    it('creates a MEMBER membership on success', async () => {
      usersService.findById.mockResolvedValue({
        isEmailVerified: true,
      } as never);
      prisma.course.findUnique.mockResolvedValue(buildCourse());
      prisma.courseMember.findUnique.mockResolvedValue(null);
      prisma.courseMember.create.mockResolvedValue({});

      const result = await service.join('user-1', { joinCode: 'ABCD2345' });

      expect(prisma.courseMember.create).toHaveBeenCalledWith({
        data: {
          courseId: 'course-1',
          userId: 'user-1',
          role: CourseRole.MEMBER,
        },
      });
      expect(result).toBeNull();
    });
  });

  describe('listMembers', () => {
    const members = [
      {
        role: CourseRole.OWNER,
        joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        user: { id: 'owner-1', fullName: 'Owner', emailAddress: 'owner@x.com' },
      },
      {
        role: CourseRole.MEMBER,
        joinedAt: new Date('2026-01-02T00:00:00.000Z'),
        user: {
          id: 'user-2',
          fullName: 'Member',
          emailAddress: 'member@x.com',
        },
      },
    ];

    it('throws notMember when the requester has no membership', async () => {
      prisma.courseMember.findUnique.mockResolvedValue(null);

      await expect(
        service.listMembers('course-1', 'user-1'),
      ).rejects.toMatchObject({
        response: { error: { code: 'NOT_COURSE_MEMBER' } },
      });
    });

    it('exposes member emails to an owner requester', async () => {
      prisma.courseMember.findUnique.mockResolvedValue({
        role: CourseRole.OWNER,
      });
      prisma.courseMember.findMany.mockResolvedValue(members);

      const result = await service.listMembers('course-1', 'owner-1');

      expect(result).toHaveLength(2);
      expect(result[0].emailAddress).toBe('owner@x.com');
      expect(result[1].emailAddress).toBe('member@x.com');
    });

    it('hides member emails from a non-owner requester', async () => {
      prisma.courseMember.findUnique.mockResolvedValue({
        role: CourseRole.MEMBER,
      });
      prisma.courseMember.findMany.mockResolvedValue(members);

      const result = await service.listMembers('course-1', 'user-2');

      expect(result[0].emailAddress).toBeUndefined();
      expect(result[1].emailAddress).toBeUndefined();
    });
  });
});
