import { Module } from '@nestjs/common';
import { NotificationsController } from './controllers/notifications.controller';
import { RemindersService } from './services/reminders.service';

@Module({
  controllers: [NotificationsController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
