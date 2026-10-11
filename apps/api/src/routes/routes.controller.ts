import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Get()
  async getAllRoutes(@Query('q') q?: string) {
    return this.routesService.findAll(q);
  }

  @Get(':id')
  async getRouteById(@Param('id') id: string) {
    return this.routesService.findById(id);
  }

  @Get(':id/telemetry')
  async getRouteTelemetry(@Param('id') id: string) {
    return this.routesService.getRouteActiveTrips(id);
  }
}
