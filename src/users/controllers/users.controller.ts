import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { UsersService } from '../services/users.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, SuccessMessage } from '../../common/app.decorator';
import { ChangePasswordDto, UpdateProfileDto } from '../dtos/user.dto';
import type { JwtUser } from '../../auth/interfaces/jwt-payload.interface';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('get-profile')
  @SuccessMessage('Profile retrieved successfully.')
  getProfile(@CurrentUser() user: JwtUser) {
    return this.usersService.findById(user.id);
  }

  @Patch('update-profile')
  @SuccessMessage('Profile updated successfully.')
  updateProfile(@CurrentUser() user: JwtUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Post('change-password')
  @SuccessMessage('Password changed successfully.')
  changePassword(@CurrentUser() user: JwtUser, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(user.id, dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @SuccessMessage('Logged out successfully.')
  logout(@CurrentUser() user: JwtUser) {
    return this.usersService.logout(user.id);
  }
}
