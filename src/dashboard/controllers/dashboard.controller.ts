import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { DashboardService } from '../services/dashboard.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, SuccessMessage } from '../../common/app.decorator';
import type { JwtUser } from '../../auth/interfaces/jwt-payload.interface';
import { DashboardQuerySchema } from '../dtos/dashboard-query.dto';
import type { DashboardQueryDto } from '../dtos/dashboard-query.dto';
import { DashboardResponseDto } from '../dtos/dashboard-response.dto';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('')
  @SuccessMessage('Dashboard retrieved successfully.')
  @ApiOkResponse({ type: DashboardResponseDto })
  getDashboard(
    @CurrentUser() user: JwtUser,
    @Query(new ZodValidationPipe(DashboardQuerySchema))
    query: DashboardQueryDto,
  ) {
    return this.dashboardService.getDashboard(user.id, query);
  }
}
