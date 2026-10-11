import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { Prisma, TripStatus } from '@prisma/client';
import { evaluateTelemetryFreshness } from '../common/utils/eta.util';

@Injectable()
export class RoutesService {
  constructor(private prisma: PrismaService) {}

  async findAll(q?: string) {
    let where: Prisma.RouteWhereInput | undefined;

    if (q && q.trim().length > 0) {
      const searchTerm = q.trim();
      const digitMatch = searchTerm.match(/\d+/);
      const orConditions: Prisma.RouteWhereInput[] = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        {
          routeStops: {
            some: {
              stop: {
                name: { contains: searchTerm, mode: 'insensitive' },
              },
            },
          },
        },
      ];

      if (digitMatch) {
        const num = digitMatch[0];
        const paddedNum = num.length === 1 ? `0${num}` : num;
        orConditions.push(
          { name: { contains: num, mode: 'insensitive' } },
          { name: { contains: paddedNum, mode: 'insensitive' } },
        );
      }

      where = {
        OR: orConditions,
      };
    }

    return this.prisma.route.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        routeStops: {
          orderBy: { sequence: 'asc' },
          select: {
            id: true,
            routeId: true,
            stopId: true,
            sequence: true,
            scheduledTime: true,
            stop: {
              select: {
                id: true,
                name: true,
                lat: true,
                lng: true,
                description: true,
                geofence: {
                  select: {
                    id: true,
                    lat: true,
                    lng: true,
                    radius: true,
                    active: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const route = await this.prisma.route.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        routeStops: {
          orderBy: { sequence: 'asc' },
          select: {
            id: true,
            routeId: true,
            stopId: true,
            sequence: true,
            scheduledTime: true,
            stop: {
              select: {
                id: true,
                name: true,
                lat: true,
                lng: true,
                description: true,
                geofence: {
                  select: {
                    id: true,
                    lat: true,
                    lng: true,
                    radius: true,
                    active: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!route) {
      throw new NotFoundException(`Route with ID ${id} not found`);
    }

    return route;
  }

  /**
   * Retrieves active trips and telemetry for a route adhering strictly to unified freshness tiers.
   */
  async getRouteActiveTrips(routeId: string, now: Date | number = Date.now()) {
    const route = await this.prisma.route.findUnique({
      where: { id: routeId },
    });

    if (!route) {
      throw new NotFoundException(`Route with ID ${routeId} not found`);
    }

    const activeTrips = await this.prisma.trip.findMany({
      where: {
        routeId,
        status: TripStatus.ACTIVE,
      },
      include: {
        bus: true,
        driver: { select: { id: true, name: true, phone: true } },
        locationHistory: {
          take: 1,
          orderBy: { recordedAt: 'desc' },
        },
      },
    });

    return activeTrips.map((trip) => {
      const latestLocation = trip.locationHistory[0] || null;
      const evaluation = evaluateTelemetryFreshness(latestLocation?.recordedAt, now);

      return {
        tripId: trip.id,
        bus: trip.bus,
        driver: trip.driver,
        latestLocation,
        telemetry: {
          freshness: evaluation.freshness,
          isStale: evaluation.isStale,
          status: evaluation.status,
          ageSeconds: evaluation.ageSeconds,
        },
      };
    });
  }
}
