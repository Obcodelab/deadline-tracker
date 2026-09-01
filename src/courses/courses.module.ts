import { Module } from '@nestjs/common';
import { CoursesController } from './controllers/courses.controller';
import { CoursesService } from './services/courses.service';
import { UsersModule } from '../users/users.module';
import { RemindersModule } from '../reminders/reminders.module';

@Module({
  imports: [UsersModule, RemindersModule],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
