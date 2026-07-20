import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from '../services/dashboard.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, SuccessMessage } from '../../common/app.decorator';
import type { JwtUser } from '../../auth/interfaces/jwt-payload.interface';
import { DashboardQueryDto } from '../dtos/dashboard-query.dto';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('')
  @SuccessMessage('Dashboard retrieved successfully.')
  getDashboard(
    @CurrentUser() user: JwtUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.getDashboard(user.id, query);
  }
}
