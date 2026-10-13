import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { DeadlinesService } from '../services/deadlines.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, SuccessMessage } from '../../common/app.decorator';
import type { JwtUser } from '../../auth/interfaces/jwt-payload.interface';
import { ToggleChecklistItemSchema } from '../dtos/deadline.dto';
import type { ToggleChecklistItemDto } from '../dtos/deadline.dto';
import {
  ChecklistToggleResponseDto,
  DeadlineResponseDto,
} from '../dtos/deadline-response.dto';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { ZodApiBody } from '../../common/zod-api-body.decorator';

@Controller('checklist')
@UseGuards(JwtAuthGuard)
export class ChecklistController {
  constructor(private readonly deadlinesService: DeadlinesService) {}

  @Patch(':id')
  @SuccessMessage('Checklist item updated successfully.')
  @ZodApiBody(ToggleChecklistItemSchema)
  @ApiOkResponse({ type: ChecklistToggleResponseDto })
  toggle(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ToggleChecklistItemSchema))
    dto: ToggleChecklistItemDto,
  ) {
    return this.deadlinesService.toggleChecklistItem(id, user.id, dto);
  }

  @Delete(':id')
  @SuccessMessage('Checklist item deleted successfully.')
  @ApiOkResponse({ type: DeadlineResponseDto })
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.deadlinesService.removeChecklistItem(id, user.id);
  }
}
