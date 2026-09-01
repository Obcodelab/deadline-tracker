import { Module } from '@nestjs/common';
import { DeadlinesController } from './controllers/deadlines.controller';
import { ChecklistController } from './controllers/checklist.controller';
import { DeadlinesService } from './services/deadlines.service';
import { CoursesModule } from '../courses/courses.module';
import { RemindersModule } from '../reminders/reminders.module';

@Module({
  imports: [CoursesModule, RemindersModule],
  controllers: [DeadlinesController, ChecklistController],
  providers: [DeadlinesService],
})
export class DeadlinesModule {}
