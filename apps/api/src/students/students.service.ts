import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { UpdatePickupDto } from './dto/update-pickup.dto';
import { RouteProgressService } from '../trips/route-progress.service';
import { TripStatus } from '@prisma/client';
import { calculateHaversineDistanceMeters } from '../common/utils/geo.util';
import {
  calculateSmoothedEtaMinutes,
  calculateDelayStatus,
  evaluateTelemetryFreshness,
} from '../common/utils/eta.util';

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routeProgressService: RouteProgressService,
  ) {}

  /**
   * Helper to resolve the student record from the authenticated user's ID or USN.
   */
  private async getStudentForUser(userId: string) {
    let student = await this.prisma.student.findUnique({
      where: { userId },
    });

    if (!student) {
      student = await this.prisma.student.findUnique({
        where: { id: userId },
      });
    }

    if (!student) {
      throw new NotFoundException('Student profile not found for authenticated user');
    }

    return student;
  }

  /**
   * Returns the authenticated student's current PickupAssignment including Route and Stop.
   */
  async getPickup(userId: string) {
    const student = await this.getStudentForUser(userId);

    const assignment = await this.prisma.pickupAssignment.findUnique({
      where: { studentId: student.id },
      include: {
        route: {
          include: {
            routeStops: {
              orderBy: { sequence: 'asc' },
              include: { stop: true },
            },
          },
        },
        stop: true,
      },
    });

    if (!assignment) return null;

    const matchedRouteStop = assignment.route?.routeStops?.find(
      (rs) => rs.stopId === assignment.stopId,
    );

    return {
      ...assignment,
      scheduledTime: matchedRouteStop?.scheduledTime ?? null,
    };
  }

  /**
   * Upserts the pickup assignment after verifying that stopId belongs to routeId.
   */
  async updatePickup(userId: string, dto: UpdatePickupDto) {
    const student = await this.getStudentForUser(userId);

    // Crucial Validation: verify stopId belongs to routeId via RouteStop
    const routeStop = await this.prisma.routeStop.findFirst({
      where: {
        routeId: dto.routeId,
        stopId: dto.stopId,
      },
    });

    if (!routeStop) {
      throw new BadRequestException('The selected stop does not belong to the specified route');
    }

    const assignment = await this.prisma.pickupAssignment.upsert({
      where: { studentId: student.id },
      create: {
        studentId: student.id,
        routeId: dto.routeId,
        stopId: dto.stopId,
        active: true,
      },
      update: {
        routeId: dto.routeId,
        stopId: dto.stopId,
        active: true,
      },
      include: {
        route: {
          include: {
            routeStops: {
              orderBy: { sequence: 'asc' },
              include: { stop: true },
            },
          },
        },
        stop: true,
      },
    });

    const matchedRouteStop = assignment.route?.routeStops?.find(
      (rs) => rs.stopId === assignment.stopId,
    );

    return {
      ...assignment,
      scheduledTime: matchedRouteStop?.scheduledTime ?? null,
    };
  }

  /**
   * Deletes the authenticated student's pickup assignment.
   */
  async deletePickup(userId: string) {
    const student = await this.getStudentForUser(userId);

    const existing = await this.prisma.pickupAssignment.findUnique({
      where: { studentId: student.id },
    });

    if (!existing) {
      throw new NotFoundException('No active pickup assignment found to delete');
    }

    await this.prisma.pickupAssignment.delete({
      where: { studentId: student.id },
    });

    return { message: 'Pickup assignment deleted successfully' };
  }

  /**
   * Calculates the smoothed ETA and distance from active bus to student's pinned pickup stop.
   * Returns explicit states: CALCULATING, AVAILABLE, STALE, UNAVAILABLE, or PASSED.
   */
  async getStudentEta(userId: string) {
    const student = await this.getStudentForUser(userId);

    const assignment = await this.prisma.pickupAssignment.findUnique({
      where: { studentId: student.id },
      include: {
        stop: true,
        route: true,
      },
    });

    if (!assignment || !assignment.active) {
      return {
        status: 'UNAVAILABLE',
        freshness: 'OFFLINE',
        isStale: true,
        tripId: null,
        stopId: null,
        stopName: null,
        distanceMeters: null,
        etaMinutes: null,
        etaSeconds: null,
        delayStatus: 'UNKNOWN',
        message: 'No active pickup assignment configured',
      };
    }

    const activeTrip = await this.prisma.trip.findFirst({
      where: {
        routeId: assignment.routeId,
        status: TripStatus.ACTIVE,
      },
      include: {
        route: {
          include: {
            routeStops: {
              orderBy: { sequence: 'asc' },
              include: { stop: true },
            },
          },
        },
      },
    });

    if (!activeTrip) {
      return {
        status: 'UNAVAILABLE',
        freshness: 'OFFLINE',
        isStale: true,
        tripId: null,
        stopId: assignment.stopId,
        stopName: assignment.stop.name,
        distanceMeters: null,
        etaMinutes: null,
        etaSeconds: null,
        delayStatus: 'UNKNOWN',
        message: 'No active bus trip running on your route',
      };
    }

    const latestLocation = await this.prisma.locationHistory.findFirst({
      where: { tripId: activeTrip.id },
      orderBy: { recordedAt: 'desc' },
    });

    if (!latestLocation) {
      return {
        status: 'OFFLINE',
        freshness: 'OFFLINE',
        isStale: true,
        tripId: activeTrip.id,
        stopId: assignment.stopId,
        stopName: assignment.stop.name,
        distanceMeters: null,
        etaMinutes: null,
        etaSeconds: null,
        delayStatus: 'UNKNOWN',
        message: 'Awaiting initial GPS telemetry from bus',
      };
    }

    // Telemetry freshness evaluation adhering strictly to unified boundary tiers
    const evaluation = evaluateTelemetryFreshness(latestLocation.recordedAt);
    const freshness = evaluation.freshness;
    const isStale = evaluation.isStale;

    const routeStops = activeTrip.route?.routeStops || [];
    const studentStopIndex = routeStops.findIndex(
      (rs) => rs.stopId === assignment.stopId,
    );

    if (studentStopIndex === -1) {
      return {
        status: 'UNAVAILABLE',
        freshness,
        isStale,
        tripId: activeTrip.id,
        stopId: assignment.stopId,
        stopName: assignment.stop.name,
        distanceMeters: null,
        etaMinutes: null,
        etaSeconds: null,
        delayStatus: 'UNKNOWN',
        message: 'Pickup stop is not sequenced in this route',
      };
    }

    const progress = await this.routeProgressService.getTripProgress(activeTrip.id);

    // Evaluate if student's pickup stop has already been PASSED
    let isPassed = false;
    if (progress.previousStopId) {
      const prevIndex = routeStops.findIndex(
        (rs) => rs.stopId === progress.previousStopId,
      );
      if (prevIndex >= studentStopIndex) {
        isPassed = true;
      }
    } else if (progress.nextStopId === null) {
      // Bus has passed all stops on the route
      isPassed = true;
    }

    if (isPassed) {
      return {
        status: 'PASSED',
        freshness,
        isStale,
        tripId: activeTrip.id,
        stopId: assignment.stopId,
        stopName: assignment.stop.name,
        distanceMeters: 0,
        etaMinutes: 0,
        etaSeconds: 0,
        delayStatus: 'ON_TIME',
        message: 'Bus has already passed your pickup stop',
      };
    }

    // Student's stop is upcoming.
    // Calculate distance along the route sequence from current location to student stop.
    let nextIndex = 0;
    if (progress.nextStopId) {
      const idx = routeStops.findIndex((rs) => rs.stopId === progress.nextStopId);
      if (idx !== -1) {
        nextIndex = idx;
      }
    }

    // 1. Distance from current bus position to the next stop
    const nextRouteStop = routeStops[nextIndex];
    let totalDistanceMeters = 0;

    if (nextRouteStop?.stop?.lat && nextRouteStop?.stop?.lng) {
      totalDistanceMeters += calculateHaversineDistanceMeters(
        latestLocation.latitude,
        latestLocation.longitude,
        nextRouteStop.stop.lat,
        nextRouteStop.stop.lng,
      );
    }

    // 2. Add sequential distance from nextStop to student's pickup stop
    for (let i = nextIndex; i < studentStopIndex; i++) {
      const from = routeStops[i].stop;
      const to = routeStops[i + 1].stop;
      if (from.lat && from.lng && to.lat && to.lng) {
        totalDistanceMeters += calculateHaversineDistanceMeters(
          from.lat,
          from.lng,
          to.lat,
          to.lng,
        );
      }
    }

    const scheduledTime = routeStops[studentStopIndex]?.scheduledTime ?? null;

    // If telemetry is OFFLINE (> 120s), suppress ETA to null and mark delayStatus UNKNOWN
    if (freshness === 'OFFLINE') {
      return {
        status: 'OFFLINE',
        freshness: 'OFFLINE',
        isStale: true,
        tripId: activeTrip.id,
        routeId: activeTrip.routeId,
        stopId: assignment.stopId,
        stopName: assignment.stop.name,
        distanceMeters: Math.round(totalDistanceMeters),
        etaMinutes: null,
        etaSeconds: null,
        delayStatus: 'UNKNOWN',
        scheduledTime,
      };
    }

    // Calculate smoothed ETA (integer minutes, zero false precision)
    const etaMinutes = calculateSmoothedEtaMinutes(
      totalDistanceMeters,
      latestLocation.speed,
    );

    const delayStatus = calculateDelayStatus(
      etaMinutes,
      scheduledTime,
      freshness,
    );

    return {
      status: isStale ? 'STALE' : 'AVAILABLE',
      freshness,
      isStale,
      tripId: activeTrip.id,
      routeId: activeTrip.routeId,
      stopId: assignment.stopId,
      stopName: assignment.stop.name,
      distanceMeters: Math.round(totalDistanceMeters),
      etaMinutes,
      etaSeconds: etaMinutes !== null ? etaMinutes * 60 : null,
      delayStatus,
      scheduledTime,
    };
  }
}
