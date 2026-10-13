import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { UsersService } from '../services/users.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, SuccessMessage } from '../../common/app.decorator';
import {
  ChangePasswordSchema,
  UpdateProfileSchema,
  UpdateReminderPreferencesSchema,
} from '../dtos/user.dto';
import type {
  ChangePasswordDto,
  UpdateProfileDto,
  UpdateReminderPreferencesDto,
} from '../dtos/user.dto';
import { UserProfileResponseDto } from '../dtos/user-response.dto';
import type { JwtUser } from '../../auth/interfaces/jwt-payload.interface';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { ZodApiBody } from '../../common/zod-api-body.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('get-profile')
  @SuccessMessage('Profile retrieved successfully.')
  @ApiOkResponse({ type: UserProfileResponseDto })
  getProfile(@CurrentUser() user: JwtUser) {
    return this.usersService.findById(user.id);
  }

  @Patch('update-profile')
  @SuccessMessage('Profile updated successfully.')
  @ZodApiBody(UpdateProfileSchema)
  @ApiOkResponse({ type: UserProfileResponseDto })
  updateProfile(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Patch('reminder-preferences')
  @SuccessMessage('Reminder preferences updated successfully.')
  @ZodApiBody(UpdateReminderPreferencesSchema)
  @ApiOkResponse({ type: UserProfileResponseDto })
  updateReminderPreferences(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(UpdateReminderPreferencesSchema))
    dto: UpdateReminderPreferencesDto,
  ) {
    return this.usersService.updateReminderPreferences(user.id, dto);
  }

  @Post('change-password')
  @SuccessMessage('Password changed successfully.')
  @ZodApiBody(ChangePasswordSchema)
  changePassword(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(ChangePasswordSchema)) dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(user.id, dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @SuccessMessage('Logged out successfully.')
  logout(@CurrentUser() user: JwtUser) {
    return this.usersService.logout(user.id);
  }
}
