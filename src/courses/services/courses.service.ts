import { Injectable } from '@nestjs/common';
import crypto from 'crypto';
import { plainToInstance } from 'class-transformer';
import { CourseRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../../users/services/users.service';
import { CreateCourseDto, JoinCourseDto, UpdateCourseDto } from '../dtos/course.dto';
import {
  CourseMemberResponseDto,
  CourseMembershipResponseDto,
  CourseResponseDto,
} from '../dtos/course-response.dto';
import { AuthErrors, CourseErrors } from '../../common/app.errors';
import { PaginationQueryDto } from '../../common/dtos/pagination-query.dto';
import { buildPaginationMeta, getPaginationParams } from '../../common/pagination.util';

const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const JOIN_CODE_LENGTH = 8;
const JOIN_CODE_GENERATION_ATTEMPTS = 5;

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  private generateJoinCodeCandidate(): string {
    let code = '';
    for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
      code += JOIN_CODE_ALPHABET[crypto.randomInt(JOIN_CODE_ALPHABET.length)];
    }
    return code;
  }

  private async generateUniqueJoinCode(): Promise<string> {
    for (let attempt = 0; attempt < JOIN_CODE_GENERATION_ATTEMPTS; attempt++) {
      const candidate = this.generateJoinCodeCandidate();
      const existing = await this.prisma.course.findUnique({
        where: { joinCode: candidate },
      });
      if (!existing) {
        return candidate;
      }
    }
    throw new Error('Failed to generate a unique join code.');
  }

  private async assertEmailVerified(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user?.isEmailVerified) {
      throw AuthErrors.emailNotVerified();
    }
  }

  private async getMembership(courseId: string, userId: string) {
    return this.prisma.courseMember.findUnique({
      where: { courseId_userId: { courseId, userId } },
    });
  }

  async assertOwner(courseId: string, userId: string) {
    const membership = await this.getMembership(courseId, userId);
    if (!membership || membership.role !== CourseRole.OWNER) {
      throw CourseErrors.notOwner();
    }
  }

  async assertMember(courseId: string, userId: string) {
    const membership = await this.getMembership(courseId, userId);
    if (!membership) {
      throw CourseErrors.notMember();
    }
    return membership;
  }

  async create(ownerId: string, dto: CreateCourseDto) {
    await this.assertEmailVerified(ownerId);

    const existingCode = await this.prisma.course.findUnique({
      where: { ownerId_code: { ownerId, code: dto.code } },
    });
    if (existingCode) {
      throw CourseErrors.codeAlreadyExists(dto.code);
    }

    const joinCode = await this.generateUniqueJoinCode();

    return this.prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: {
          ...dto,
          ownerId,
          joinCode,
        },
        select: {
          id: true,
          name: true,
          code: true,
          term: true,
          color: true,
          joinCode: true,
          archived: true,
          ownerId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await tx.courseMember.create({
        data: {
          courseId: course.id,
          userId: ownerId,
          role: CourseRole.OWNER,
        },
      });

      return plainToInstance(CourseResponseDto, course, {
        excludeExtraneousValues: true,
      });
    });
  }

  async findAllForUser(userId: string, pagination: PaginationQueryDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const { skip, take } = getPaginationParams(page, limit);

    const [memberships, total] = await this.prisma.$transaction([
      this.prisma.courseMember.findMany({
        where: { userId },
        include: {
          course: {
            include: {
              _count: { select: { members: true, deadlines: true } },
            },
          },
        },
        orderBy: { joinedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.courseMember.count({ where: { userId } }),
    ]);

    const results = memberships.map(({ course, role }) => ({
      id: course.id,
      name: course.name,
      code: course.code,
      term: course.term,
      color: course.color,
      joinCode: course.joinCode,
      archived: course.archived,
      role,
      memberCount: course._count.members,
      deadlineCount: course._count.deadlines,
    }));

    return {
      items: plainToInstance(CourseMembershipResponseDto, results, {
        excludeExtraneousValues: true,
      }),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async findOne(courseId: string, userId: string) {
    const membership = await this.assertMember(courseId, userId);

    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        _count: { select: { members: true, deadlines: true } },
      },
    });

    if (!course) {
      throw CourseErrors.notFound();
    }

    return plainToInstance(
      CourseMembershipResponseDto,
      {
        id: course.id,
        name: course.name,
        code: course.code,
        term: course.term,
        color: course.color,
        joinCode: course.joinCode,
        archived: course.archived,
        role: membership.role,
        memberCount: course._count.members,
        deadlineCount: course._count.deadlines,
      },
      { excludeExtraneousValues: true },
    );
  }

  async update(courseId: string, userId: string, dto: UpdateCourseDto) {
    await this.assertOwner(courseId, userId);

    if (dto.code) {
      const existingCode = await this.prisma.course.findUnique({
        where: { ownerId_code: { ownerId: userId, code: dto.code } },
      });
      if (existingCode && existingCode.id !== courseId) {
        throw CourseErrors.codeAlreadyExists(dto.code);
      }
    }

    const course = await this.prisma.course.update({
      where: { id: courseId },
      data: dto,
      select: {
        id: true,
        name: true,
        code: true,
        term: true,
        color: true,
        joinCode: true,
        archived: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return plainToInstance(CourseResponseDto, course, {
      excludeExtraneousValues: true,
    });
  }

  async remove(courseId: string, userId: string) {
    await this.assertOwner(courseId, userId);

    const linkedDeadlines = await this.prisma.deadline.count({
      where: { courseId },
    });

    if (linkedDeadlines > 0) {
      throw CourseErrors.hasLinkedDeadlines();
    }

    await this.prisma.course.delete({ where: { id: courseId } });

    return null;
  }

  async join(userId: string, dto: JoinCourseDto) {
    await this.assertEmailVerified(userId);

    const course = await this.prisma.course.findUnique({
      where: { joinCode: dto.joinCode },
    });

    if (!course) {
      throw CourseErrors.invalidJoinCode();
    }

    const existingMembership = await this.getMembership(course.id, userId);
    if (existingMembership) {
      throw CourseErrors.alreadyMember();
    }

    await this.prisma.courseMember.create({
      data: {
        courseId: course.id,
        userId,
        role: CourseRole.MEMBER,
      },
    });

    return null;
  }

  async listMembers(courseId: string, userId: string) {
    const requesterMembership = await this.assertMember(courseId, userId);
    const isOwner = requesterMembership.role === CourseRole.OWNER;

    const members = await this.prisma.courseMember.findMany({
      where: { courseId },
      include: {
        user: {
          select: { id: true, fullName: true, emailAddress: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    const results = members.map((member) => ({
      id: member.user.id,
      fullName: member.user.fullName,
      emailAddress: isOwner ? member.user.emailAddress : undefined,
      role: member.role,
      joinedAt: member.joinedAt,
    }));

    return plainToInstance(CourseMemberResponseDto, results, {
      excludeExtraneousValues: true,
    });
  }
}
