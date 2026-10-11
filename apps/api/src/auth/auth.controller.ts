import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AdminLoginDto, StudentLoginDto, DriverLoginDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('admin/login')
  loginAdmin(@Body() dto: AdminLoginDto) {
    return this.authService.loginAdmin(dto.email, dto.password);
  }

  @Post('student/login')
  loginStudent(@Body() dto: StudentLoginDto) {
    return this.authService.loginStudent(dto.usn, dto.dob);
  }

  @Post('driver/login')
  loginDriver(@Body() dto: DriverLoginDto) {
    return this.authService.loginDriver(dto.mobile, dto.otp);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: { id: string; role: string }) {
    return this.authService.getMe(user.id);
  }
}
