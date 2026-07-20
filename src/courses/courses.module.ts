import { Module } from '@nestjs/common';
import { CoursesController } from './controllers/courses.controller';
import { CoursesService } from './services/courses.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
