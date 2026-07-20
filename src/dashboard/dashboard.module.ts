import { Module } from '@nestjs/common';
import { DashboardController } from './controllers/dashboard.controller';
import { DashboardService } from './services/dashboard.service';
import { CoursesModule } from '../courses/courses.module';

@Module({
  imports: [CoursesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
