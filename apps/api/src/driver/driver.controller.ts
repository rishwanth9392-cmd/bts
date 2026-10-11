import { Controller, Get, UseGuards } from '@nestjs/common';
import { DriverService } from './driver.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DRIVER)
@Controller(['drivers', 'driver'])
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  @Get('me/trip')
  async getMyTrip(@CurrentUser() user: { id: string; sub?: string }) {
    return this.driverService.getCurrentTrip(user.sub || user.id);
  }
}
