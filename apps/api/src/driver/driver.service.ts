import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { TripStatus, BoardingEventType } from '@prisma/client';
import { calculateTripOccupancy } from '../common/utils/eta.util';

@Injectable()
export class DriverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetches the current ACTIVE or READY trip assigned to the driver.
   * Ensures data minimization: suppresses passenger relational rosters
   * and raw headcounts, returning only percentage and status bands.
   */
  async getCurrentTrip(userId: string) {
    const driver = await this.prisma.driver.findFirst({
      where: {
        OR: [{ userId }, { id: userId }],
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver profile not found');
    }

    // Prioritize an already ACTIVE trip, then look for a READY trip
    let trip = await this.prisma.trip.findFirst({
      where: {
        driverId: driver.id,
        status: TripStatus.ACTIVE,
      },
      include: {
        bus: true,
        route: {
          include: {
            routeStops: {
              orderBy: { sequence: 'asc' },
              include: { stop: true },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!trip) {
      trip = await this.prisma.trip.findFirst({
        where: {
          driverId: driver.id,
          status: TripStatus.READY,
        },
        include: {
          bus: true,
          route: {
            include: {
              routeStops: {
                orderBy: { sequence: 'asc' },
                include: { stop: true },
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    if (!trip) {
      return null;
    }

    const [boarded, dropped] = await Promise.all([
      this.prisma.boardingEvent.count({
        where: { tripId: trip.id, type: BoardingEventType.BOARD },
      }),
      this.prisma.boardingEvent.count({
        where: { tripId: trip.id, type: BoardingEventType.DROP },
      }),
    ]);

    const capacity = trip.bus?.capacity || 50;
    const calc = calculateTripOccupancy(boarded, dropped, capacity);

    return {
      ...trip,
      occupancyPercent: calc.occupancyPercent,
      occupancyStatus: calc.occupancyStatus,
    };
  }
}

