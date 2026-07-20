import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { DeadlinesService } from '../services/deadlines.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, SuccessMessage } from '../../common/app.decorator';
import type { JwtUser } from '../../auth/interfaces/jwt-payload.interface';
import { ToggleChecklistItemDto } from '../dtos/deadline.dto';

@Controller('checklist')
@UseGuards(JwtAuthGuard)
export class ChecklistController {
  constructor(private readonly deadlinesService: DeadlinesService) {}

  @Patch(':id')
  @SuccessMessage('Checklist item updated successfully.')
  toggle(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: ToggleChecklistItemDto,
  ) {
    return this.deadlinesService.toggleChecklistItem(id, user.id, dto);
  }

  @Delete(':id')
  @SuccessMessage('Checklist item deleted successfully.')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.deadlinesService.removeChecklistItem(id, user.id);
  }
}
