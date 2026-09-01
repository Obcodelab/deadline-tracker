import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RemindersService } from '../services/reminders.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, SuccessMessage } from '../../common/app.decorator';
import type { JwtUser } from '../../auth/interfaces/jwt-payload.interface';
import {
  ListNotificationsQueryDto,
  MarkNotificationReadDto,
} from '../dtos/notification.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get()
  @SuccessMessage('Notifications retrieved successfully.')
  getNotifications(
    @CurrentUser() user: JwtUser,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.remindersService.getNotifications(user.id, query);
  }

  // Declared before ':id' so it isn't swallowed as an id param.
  @Patch('read-all')
  @SuccessMessage('All notifications marked as read.')
  markAllAsRead(@CurrentUser() user: JwtUser) {
    return this.remindersService.markAllAsRead(user.id);
  }

  @Patch(':id')
  @SuccessMessage('Notification updated successfully.')
  markAsRead(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: MarkNotificationReadDto,
  ) {
    return this.remindersService.markAsRead(id, user.id, dto);
  }
}
