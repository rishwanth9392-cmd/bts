import { Controller, Get, UseGuards } from '@nestjs/common';
import { BusesService } from './buses.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('buses')
export class BusesController {
  constructor(private readonly busesService: BusesService) {}

  @Get('fleet')
  async getActiveFleet() {
    return this.busesService.getActiveFleet();
  }
}
