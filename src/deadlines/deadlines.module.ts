import { Module } from '@nestjs/common';
import { DeadlinesController } from './controllers/deadlines.controller';
import { ChecklistController } from './controllers/checklist.controller';
import { DeadlinesService } from './services/deadlines.service';
import { CoursesModule } from '../courses/courses.module';

@Module({
  imports: [CoursesModule],
  controllers: [DeadlinesController, ChecklistController],
  providers: [DeadlinesService],
})
export class DeadlinesModule {}
