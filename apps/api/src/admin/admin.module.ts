import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AssignmentIntegrityService } from './assignment-integrity.service';
import { TripsModule } from '../trips/trips.module';

@Module({
  imports: [TripsModule],
  controllers: [AdminController],
  providers: [AdminService, AssignmentIntegrityService],
  exports: [AdminService, AssignmentIntegrityService],
})
export class AdminModule {}
