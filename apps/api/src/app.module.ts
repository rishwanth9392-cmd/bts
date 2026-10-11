import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { RoutesModule } from './routes/routes.module';
import { BusesModule } from './buses/buses.module';
import { TripsModule } from './trips/trips.module';
import { BoardingModule } from './boarding/boarding.module';
import { AuthModule } from './auth/auth.module';
import { StudentsModule } from './students/students.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DriverModule } from './driver/driver.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    RoutesModule,
    BusesModule,
    TripsModule,
    BoardingModule,
    StudentsModule,
    NotificationsModule,
    DriverModule,
    AdminModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

