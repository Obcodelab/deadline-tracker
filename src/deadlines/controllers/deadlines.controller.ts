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
import { DeadlinesService } from '../services/deadlines.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, SuccessMessage } from '../../common/app.decorator';
import type { JwtUser } from '../../auth/interfaces/jwt-payload.interface';
import {
  CreateChecklistItemDto,
  CreateDeadlineDto,
  ListDeadlinesQueryDto,
  UpdateDeadlineDto,
} from '../dtos/deadline.dto';

@Controller('deadlines')
@UseGuards(JwtAuthGuard)
export class DeadlinesController {
  constructor(private readonly deadlinesService: DeadlinesService) {}

  @Post()
  @SuccessMessage('Deadline created successfully.')
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateDeadlineDto) {
    return this.deadlinesService.create(user.id, dto);
  }

  @Get()
  @SuccessMessage('Deadlines retrieved successfully.')
  findAll(@CurrentUser() user: JwtUser, @Query() query: ListDeadlinesQueryDto) {
    return this.deadlinesService.findAll(user.id, query);
  }

  @Get(':id')
  @SuccessMessage('Deadline retrieved successfully.')
  findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.deadlinesService.findOne(id, user.id);
  }

  @Patch(':id')
  @SuccessMessage('Deadline updated successfully.')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateDeadlineDto,
  ) {
    return this.deadlinesService.update(id, user.id, dto);
  }

  @Delete(':id')
  @SuccessMessage('Deadline deleted successfully.')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.deadlinesService.remove(id, user.id);
  }

  @Post(':id/checklist')
  @SuccessMessage('Checklist item added successfully.')
  addChecklistItem(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CreateChecklistItemDto,
  ) {
    return this.deadlinesService.addChecklistItem(id, user.id, dto);
  }
}
