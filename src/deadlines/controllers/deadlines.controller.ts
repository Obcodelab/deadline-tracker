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
import { DeadlinesService } from '../services/deadlines.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, SuccessMessage } from '../../common/app.decorator';
import type { JwtUser } from '../../auth/interfaces/jwt-payload.interface';
import {
  CreateChecklistItemSchema,
  CreateDeadlineSchema,
  ListDeadlinesQuerySchema,
  UpdateDeadlineSchema,
} from '../dtos/deadline.dto';
import type {
  CreateChecklistItemDto,
  CreateDeadlineDto,
  ListDeadlinesQueryDto,
  UpdateDeadlineDto,
} from '../dtos/deadline.dto';
import {
  DeadlineListItemResponseDto,
  DeadlineResponseDto,
} from '../dtos/deadline-response.dto';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { ZodApiBody } from '../../common/zod-api-body.decorator';
import { ApiPaginatedResponse } from '../../common/api-paginated-response.decorator';

@Controller('deadlines')
@UseGuards(JwtAuthGuard)
export class DeadlinesController {
  constructor(private readonly deadlinesService: DeadlinesService) {}

  @Post()
  @SuccessMessage('Deadline created successfully.')
  @ZodApiBody(CreateDeadlineSchema)
  @ApiOkResponse({ type: DeadlineResponseDto })
  create(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(CreateDeadlineSchema)) dto: CreateDeadlineDto,
  ) {
    return this.deadlinesService.create(user.id, dto);
  }

  @Get()
  @SuccessMessage('Deadlines retrieved successfully.')
  @ApiPaginatedResponse(DeadlineListItemResponseDto)
  findAll(
    @CurrentUser() user: JwtUser,
    @Query(new ZodValidationPipe(ListDeadlinesQuerySchema))
    query: ListDeadlinesQueryDto,
  ) {
    return this.deadlinesService.findAll(user.id, query);
  }

  @Get(':id')
  @SuccessMessage('Deadline retrieved successfully.')
  @ApiOkResponse({ type: DeadlineResponseDto })
  findOne(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.deadlinesService.findOne(id, user.id);
  }

  @Patch(':id')
  @SuccessMessage('Deadline updated successfully.')
  @ZodApiBody(UpdateDeadlineSchema)
  @ApiOkResponse({ type: DeadlineResponseDto })
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateDeadlineSchema)) dto: UpdateDeadlineDto,
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
  @ZodApiBody(CreateChecklistItemSchema)
  @ApiOkResponse({ type: DeadlineResponseDto })
  addChecklistItem(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateChecklistItemSchema))
    dto: CreateChecklistItemDto,
  ) {
    return this.deadlinesService.addChecklistItem(id, user.id, dto);
  }
}
