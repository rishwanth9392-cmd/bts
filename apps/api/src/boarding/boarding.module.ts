import { Module } from '@nestjs/common';
import { BoardingController } from './boarding.controller';
import { BoardingService } from './boarding.service';
import { TripsModule } from '../trips/trips.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TripsModule, AuthModule, NotificationsModule],
  controllers: [BoardingController],
  providers: [BoardingService],
  exports: [BoardingService],
})
export class BoardingModule {}
