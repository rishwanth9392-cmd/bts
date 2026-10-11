import { Injectable } from '@nestjs/common';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { TripsService } from '../trips/trips.service';

@Injectable()
export class BoardingService {
  constructor(private readonly tripsService: TripsService) {}

  /**
   * Secure, idempotent student boarding check-in (APP method).
   * Derives student identity strictly from authenticated JWT subject.
   */
  async checkIn(userIdentifier: string, dto: CheckInDto) {
    return this.tripsService.boardTrip(dto.tripId, userIdentifier);
  }

  /**
   * Secure, idempotent student drop check-out (APP method).
   * Transactional verification that student has boarded and hasn't yet dropped.
   */
  async checkOut(userIdentifier: string, dto: CheckOutDto) {
    return this.tripsService.dropTrip(dto.tripId, userIdentifier);
  }

  /**
   * Event-sourced dynamic occupancy calculation and WebSocket broadcast.
   */
  async calculateAndBroadcastOccupancy(
    tripId: string,
    recentBoarding?: { stopId?: string | null; stopName?: string },
  ) {
    return this.tripsService.calculateAndBroadcastOccupancy(tripId, recentBoarding);
  }
}
