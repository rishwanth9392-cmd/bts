import { Module, forwardRef } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { TripsGateway } from './trips.gateway';
import { GeofenceService } from './geofence.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { RouteProgressService } from './route-progress.service';
import { EtaService } from './eta.service';

@Module({
  imports: [AuthModule, forwardRef(() => NotificationsModule)],
  controllers: [TripsController],
  providers: [
    TripsService,
    TripsGateway,
    GeofenceService,
    RouteProgressService,
    EtaService,
  ],
  exports: [
    TripsService,
    TripsGateway,
    GeofenceService,
    RouteProgressService,
    EtaService,
  ],
})
export class TripsModule {}
