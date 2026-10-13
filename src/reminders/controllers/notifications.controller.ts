import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { RemindersService } from '../services/reminders.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, SuccessMessage } from '../../common/app.decorator';
import type { JwtUser } from '../../auth/interfaces/jwt-payload.interface';
import {
  ListNotificationsQuerySchema,
  MarkNotificationReadSchema,
} from '../dtos/notification.dto';
import type {
  ListNotificationsQueryDto,
  MarkNotificationReadDto,
} from '../dtos/notification.dto';
import { NotificationResponseDto } from '../dtos/notification-response.dto';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { ZodApiBody } from '../../common/zod-api-body.decorator';
import { ApiPaginatedResponse } from '../../common/api-paginated-response.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get()
  @SuccessMessage('Notifications retrieved successfully.')
  @ApiPaginatedResponse(NotificationResponseDto)
  getNotifications(
    @CurrentUser() user: JwtUser,
    @Query(new ZodValidationPipe(ListNotificationsQuerySchema))
    query: ListNotificationsQueryDto,
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
  @ZodApiBody(MarkNotificationReadSchema)
  @ApiOkResponse({ type: NotificationResponseDto })
  markAsRead(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(MarkNotificationReadSchema))
    dto: MarkNotificationReadDto,
  ) {
    return this.remindersService.markAsRead(id, user.id, dto);
  }
}
