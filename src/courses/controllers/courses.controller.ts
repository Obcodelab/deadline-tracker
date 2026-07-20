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
import { CoursesService } from '../services/courses.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, SuccessMessage } from '../../common/app.decorator';
import type { JwtUser } from '../../auth/interfaces/jwt-payload.interface';
import {
  CreateCourseDto,
  JoinCourseDto,
  UpdateCourseDto,
} from '../dtos/course.dto';
import { PaginationQueryDto } from '../../common/dtos/pagination-query.dto';

@Controller('courses')
@UseGuards(JwtAuthGuard)
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Post()
  @SuccessMessage('Course created successfully.')
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateCourseDto) {
    return this.coursesService.create(user.id, dto);
  }

  @Get()
  @SuccessMessage('Courses retrieved successfully.')
  findAll(@CurrentUser() user: JwtUser, @Query() query: PaginationQueryDto) {
    return this.coursesService.findAllForUser(user.id, query);
  }

  @Post('join')
  @SuccessMessage('Joined course successfully.')
  join(@CurrentUser() user: JwtUser, @Body() dto: JoinCourseDto) {
    return this.coursesService.join(user.id, dto);
  }

  @Get(':id')
  @SuccessMessage('Course retrieved successfully.')
  findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.coursesService.findOne(id, user.id);
  }

  @Patch(':id')
  @SuccessMessage('Course updated successfully.')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
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
  listMembers(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.coursesService.listMembers(id, user.id);
  }
}
