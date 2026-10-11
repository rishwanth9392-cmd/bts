import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { TripsService } from './trips.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { LocationUpdateDto } from './dto/location-update.dto';

import { RouteProgressService } from './route-progress.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trips')
export class TripsController {
  constructor(
    private readonly tripsService: TripsService,
    private readonly routeProgressService: RouteProgressService,
  ) {}

  @Get(':id/progress')
  async getTripProgress(@Param('id') id: string) {
    return this.routeProgressService.getTripProgress(id);
  }

  @Get('active')
  async getActiveTrips(@CurrentUser() user: { id: string; role: string }) {
    return this.tripsService.getActiveTrips(user);
  }

  @Get(':id')
  async getTripById(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; sub?: string; role: string },
  ) {
    return this.tripsService.getTripById(id, user);
  }

  @Post(':id/start')
  @Roles(Role.DRIVER)
  async startTrip(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; sub?: string },
  ) {
    return this.tripsService.startTrip(id, user.sub || user.id);
  }

  @Post(':id/end')
  @Roles(Role.DRIVER)
  async endTrip(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; sub?: string },
  ) {
    return this.tripsService.endTrip(id, user.sub || user.id);
  }

  @Post(':id/stop')
  @Roles(Role.DRIVER)
  async stopTrip(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; sub?: string },
  ) {
    return this.tripsService.endTrip(id, user.sub || user.id);
  }

  @Post(':id/sos')
  @Roles(Role.DRIVER)
  async triggerSos(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; sub?: string },
  ) {
    return this.tripsService.triggerSos(id, user.sub || user.id);
  }

  @Post(':id/simulate')
  @Roles(Role.DRIVER)
  async simulateTripLocation(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; sub?: string },
    @Body() dto: LocationUpdateDto,
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'Simulator routes are strictly disabled in production environments.',
      );
    }
    return this.tripsService.simulateLocation(id, user.sub || user.id, dto);
  }

  @Post(':id/location')
  @Roles(Role.DRIVER)
  async updateLocation(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; sub?: string },
    @Body() dto: LocationUpdateDto,
  ) {
    return this.tripsService.recordLocation(id, user.sub || user.id, dto);
  }

  @Get(':id/location/latest')
  async getLatestLocation(@Param('id') id: string) {
    return this.tripsService.getLatestLocation(id);
  }

  @Post(':id/board')
  @Roles(Role.STUDENT)
  async boardTrip(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; sub?: string; role: string },
    @Body() _body?: any,
  ) {
    const studentIdentifier = user.sub || user.id;
    return this.tripsService.boardTrip(id, studentIdentifier, _body);
  }

  @Post(':id/drop')
  @Roles(Role.STUDENT)
  async dropTrip(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; sub?: string; role: string },
    @Body() _body?: any,
  ) {
    const studentIdentifier = user.sub || user.id;
    return this.tripsService.dropTrip(id, studentIdentifier, _body);
  }
}


