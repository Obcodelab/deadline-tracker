import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { CoursesService } from '../services/courses.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, SuccessMessage } from '../../common/app.decorator';
import type { JwtUser } from '../../auth/interfaces/jwt-payload.interface';
import {
  CreateCourseSchema,
  JoinCourseSchema,
  UpdateCourseSchema,
} from '../dtos/course.dto';
import type {
  CreateCourseDto,
  JoinCourseDto,
  UpdateCourseDto,
} from '../dtos/course.dto';
import {
  CourseMemberResponseDto,
  CourseMembershipResponseDto,
  CourseResponseDto,
} from '../dtos/course-response.dto';
import { PaginationQuerySchema } from '../../common/dtos/pagination-query.dto';
import type { PaginationQueryDto } from '../../common/dtos/pagination-query.dto';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { ZodApiBody } from '../../common/zod-api-body.decorator';
import { ApiPaginatedResponse } from '../../common/api-paginated-response.decorator';

@Controller('courses')
@UseGuards(JwtAuthGuard)
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Post()
  @SuccessMessage('Course created successfully.')
  @ZodApiBody(CreateCourseSchema)
  @ApiOkResponse({ type: CourseResponseDto })
  create(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(CreateCourseSchema)) dto: CreateCourseDto,
  ) {
    return this.coursesService.create(user.id, dto);
  }

  @Get()
  @SuccessMessage('Courses retrieved successfully.')
  @ApiPaginatedResponse(CourseMembershipResponseDto)
  findAll(
    @CurrentUser() user: JwtUser,
    @Query(new ZodValidationPipe(PaginationQuerySchema))
    query: PaginationQueryDto,
  ) {
    return this.coursesService.findAllForUser(user.id, query);
  }

  @Post('join')
  @SuccessMessage('Joined course successfully.')
  @ZodApiBody(JoinCourseSchema)
  join(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(JoinCourseSchema)) dto: JoinCourseDto,
  ) {
    return this.coursesService.join(user.id, dto);
  }

  @Get(':id')
  @SuccessMessage('Course retrieved successfully.')
  @ApiOkResponse({ type: CourseResponseDto })
  findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.coursesService.findOne(id, user.id);
  }

  @Patch(':id')
  @SuccessMessage('Course updated successfully.')
  @ZodApiBody(UpdateCourseSchema)
  @ApiOkResponse({ type: CourseResponseDto })
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCourseSchema)) dto: UpdateCourseDto,
  ) {
    return this.coursesService.update(id, user.id, dto);
  }

  @Delete(':id')
  @SuccessMessage('Course deleted successfully.')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.coursesService.remove(id, user.id);
  }

  @Get(':id/members')
  @SuccessMessage('Course members retrieved successfully.')
  @ApiOkResponse({ type: CourseMemberResponseDto, isArray: true })
  listMembers(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.coursesService.listMembers(id, user.id);
  }
}
