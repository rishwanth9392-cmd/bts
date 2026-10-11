import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { TripStatus, BoardingEventType, BoardingMethod, BoardingStatus } from '@prisma/client';
import { LocationUpdateDto } from './dto/location-update.dto';
import { TripsGateway } from './trips.gateway';
import { GeofenceService } from './geofence.service';
import { RouteProgressService } from './route-progress.service';
import { EtaService } from './eta.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  evaluateTelemetryFreshness,
  calculateTripOccupancy,
  OccupancyCategory,
} from '../common/utils/eta.util';
import type { TripOccupancyPayload } from '@bts/shared';

@Injectable()
export class TripsService {
  constructor(
    private prisma: PrismaService,
    private tripsGateway: TripsGateway,
    private geofenceService: GeofenceService,
    private routeProgressService: RouteProgressService,
    @Optional() private etaService?: EtaService,
    @Optional() private notificationsService?: NotificationsService,
  ) {}

  async getActiveTrips(user: { id: string; role: string }) {
    let filterCondition: any = { status: TripStatus.ACTIVE };

    if (user.role === 'DRIVER') {
      filterCondition = {
        status: TripStatus.ACTIVE,
        driver: {
          userId: user.id,
        },
      };
    }

    const trips = await this.prisma.trip.findMany({
      where: filterCondition,
      include: {
        bus: true,
        route: true,
        boardings: true,
      },
    });

    // Map response to calculate occupancy directly from event log with clamping and data minimization
    return trips.map((trip) => {
      const boarded = trip.boardings.filter((b) => b.type === BoardingEventType.BOARD).length;
      const dropped = trip.boardings.filter((b) => b.type === BoardingEventType.DROP).length;
      const capacity = trip.bus?.capacity || 50;
      const calc = calculateTripOccupancy(boarded, dropped, capacity);

      const { boardings: _boardings, ...sanitizedTrip } = trip;

      // Suppress raw passenger counts in student and driver views
      if (user && (user.role === 'STUDENT' || user.role === 'DRIVER')) {
        return {
          ...sanitizedTrip,
          occupancyPercent: calc.occupancyPercent,
          occupancyPercentage: calc.occupancyPercentage,
          occupancyStatus: calc.occupancyStatus,
        };
      }

      return {
        ...sanitizedTrip,
        calculatedOccupancy: calc.netPassengers,
        occupancyPercent: calc.occupancyPercent,
        occupancyPercentage: calc.occupancyPercentage,
        occupancyStatus: calc.occupancyStatus,
      };
    });
  }

  async startTrip(tripId: string, userId: string) {
    const { updated, isAlreadyActive } = await this.prisma.$transaction(
      async (tx) => {
        const trip = await tx.trip.findUnique({
          where: { id: tripId },
          include: { driver: true },
        });

        if (!trip) {
          throw new NotFoundException('Trip not found');
        }

        if (
          !trip.driver ||
          (trip.driver.userId !== userId && trip.driver.id !== userId)
        ) {
          throw new ForbiddenException(
            'You are not authorized to start this trip',
          );
        }

        // If the trip is already ACTIVE, return the existing active trip cleanly (idempotent retry)
        if (trip.status === TripStatus.ACTIVE) {
          return { updated: trip, isAlreadyActive: true };
        }

        // If the trip is COMPLETED or CANCELLED, reject with BadRequestException (400)
        if (
          trip.status === TripStatus.COMPLETED ||
          trip.status === TripStatus.CANCELLED
        ) {
          throw new BadRequestException(
            `Cannot start trip. Current status is ${trip.status}.`,
          );
        }

        // Verify status is valid starting status (READY or SCHEDULED)
        if (
          trip.status !== TripStatus.READY &&
          trip.status !== TripStatus.SCHEDULED
        ) {
          throw new BadRequestException(
            `Cannot start trip. Current status is ${trip.status}, expected READY or SCHEDULED.`,
          );
        }

        const updatedTrip = await tx.trip.update({
          where: { id: tripId },
          data: {
            status: TripStatus.ACTIVE,
            startTime: trip.startTime || new Date(),
          },
          include: { driver: true },
        });

        await tx.tripAudit.create({
          data: {
            tripId: trip.id,
            driverId: trip.driverId,
            action: 'TRIP_STARTED',
            timestamp: new Date(),
            metadata: {
              initiatedBy: userId,
              previousStatus: trip.status,
              startedAt: (updatedTrip.startTime || new Date()).toISOString(),
            },
          },
        });

        return { updated: updatedTrip, isAlreadyActive: false };
      },
    );

    // Only broadcast trip:started over WebSockets after the transaction successfully commits
    if (!isAlreadyActive) {
      this.tripsGateway?.broadcastTripStarted(updated.id, {
        tripId: updated.id,
        status: 'ACTIVE',
        timestamp: (updated.startTime || new Date()).toISOString(),
      });
    }

    return updated;
  }

  async endTrip(tripId: string, userId: string) {
    const { updated, isAlreadyCompleted } = await this.prisma.$transaction(
      async (tx) => {
        const trip = await tx.trip.findUnique({
          where: { id: tripId },
          include: { driver: true },
        });

        if (!trip) {
          throw new NotFoundException('Trip not found');
        }

        if (
          !trip.driver ||
          (trip.driver.userId !== userId && trip.driver.id !== userId)
        ) {
          throw new ForbiddenException(
            'You are not authorized to end this trip',
          );
        }

        // If the trip is already COMPLETED, treat idempotently and return the existing record
        if (trip.status === TripStatus.COMPLETED) {
          return { updated: trip, isAlreadyCompleted: true };
        }

        // If the trip is CANCELLED, reject with BadRequestException (400)
        if (trip.status === TripStatus.CANCELLED) {
          throw new BadRequestException(
            'Cannot end trip. Trip is already CANCELLED.',
          );
        }

        // Verify that the trip is currently ACTIVE
        if (trip.status !== TripStatus.ACTIVE) {
          throw new BadRequestException(
            `Cannot end trip. Current status is ${trip.status}, expected ACTIVE.`,
          );
        }

        const updatedTrip = await tx.trip.update({
          where: { id: tripId },
          data: {
            status: TripStatus.COMPLETED,
            endTime: trip.endTime || new Date(),
          },
          include: { driver: true },
        });

        await tx.tripAudit.create({
          data: {
            tripId: trip.id,
            driverId: trip.driverId,
            action: 'TRIP_COMPLETED',
            timestamp: new Date(),
            metadata: {
              initiatedBy: userId,
              previousStatus: trip.status,
              endedAt: (updatedTrip.endTime || new Date()).toISOString(),
            },
          },
        });

        return { updated: updatedTrip, isAlreadyCompleted: false };
      },
    );

    // Clear in-memory geofence/ETA tracking state and broadcast trip:completed after transaction commits
    if (!isAlreadyCompleted) {
      this.geofenceService?.clearTripGeofenceState(updated.id);
      this.routeProgressService?.clearTripState(updated.id);
      this.etaService?.clearTripState(updated.id);

      this.tripsGateway?.broadcastTripCompleted(updated.id, {
        tripId: updated.id,
        status: 'COMPLETED',
        timestamp: (updated.endTime || new Date()).toISOString(),
      });
    }

    return updated;
  }

  async stopTrip(tripId: string, userId: string) {
    return this.endTrip(tripId, userId);
  }

  /**
   * Development simulator GPS ingestion method.
   * Strictly gated behind non-production environment.
   */
  async simulateLocation(tripId: string, userId: string, dto: LocationUpdateDto) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'Simulator routes are strictly disabled in production environments.',
      );
    }
    return this.recordLocation(tripId, userId, dto);
  }

  async recordLocation(tripId: string, userId: string, dto: LocationUpdateDto) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { driver: true },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    if (!trip.driver || trip.driver.userId !== userId) {
      throw new ForbiddenException('You are not authorized to update location for this trip');
    }

    if (trip.status !== TripStatus.ACTIVE) {
      throw new BadRequestException('Trip is not active');
    }

    const recordedAtDate = new Date(dto.recordedAt);
    if (isNaN(recordedAtDate.getTime())) {
      throw new BadRequestException('Invalid recordedAt date format');
    }

    const now = Date.now();
    const maxFutureMs = 5 * 60 * 1000; // 5 minutes clock-skew prevention

    if (recordedAtDate.getTime() > now + maxFutureMs) {
      throw new BadRequestException('recordedAt timestamp cannot be more than 5 minutes in the future');
    }

    const location = await this.prisma.locationHistory.create({
      data: {
        tripId: trip.id,
        busId: trip.busId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        speed: dto.speed ?? null,
        heading: dto.heading ?? null,
        accuracy: dto.accuracy ?? null,
        recordedAt: recordedAtDate,
      },
    });

    // Broadcast location to specific trip room via TripsGateway
    this.tripsGateway.broadcastLocation(trip.id, {
      tripId: trip.id,
      latitude: location.latitude,
      longitude: location.longitude,
      speed: location.speed,
      heading: location.heading,
      accuracy: location.accuracy,
      recordedAt: location.recordedAt.toISOString(),
      status: 'ACTIVE',
    });

    // Asynchronously evaluate geofence transitions without blocking HTTP response
    this.geofenceService
      .processLocationUpdate(trip.id, trip.routeId, location.latitude, location.longitude)
      .catch(() => {
        // Error logged inside GeofenceService, safeguard unhandled rejection
      });

    // Asynchronously process route progress, delay detection, and throttled WebSocket broadcasting
    this.routeProgressService
      .processLocationUpdate(trip.id, location)
      .catch(() => {
        // Error logged inside RouteProgressService, safeguard unhandled rejection
      });

    return location;
  }

  async getLatestLocation(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    const latest = await this.prisma.locationHistory.findFirst({
      where: { tripId },
      orderBy: { recordedAt: 'desc' },
    });

    if (!latest) {
      return {
        location: null,
        status: 'OFFLINE',
        freshness: 'OFFLINE',
        isStale: true,
      };
    }

    const evaluation = evaluateTelemetryFreshness(latest.recordedAt);

    return {
      ...latest,
      status: evaluation.status,
      freshness: evaluation.freshness,
      isStale: evaluation.isStale,
      ageSeconds: evaluation.ageSeconds,
      location: latest,
    };
  }

  async triggerSos(tripId: string, userId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { driver: true, bus: true, route: true },
    });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    if (!trip.driver || (trip.driver.userId !== userId && trip.driver.id !== userId)) {
      throw new ForbiddenException('You are not authorized for this trip');
    }

    if (trip.status !== TripStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot trigger SOS. Trip must be ACTIVE, but current status is ${trip.status}`,
      );
    }

    // Query LocationHistory table to find the most recent GPS coordinate for this trip
    const lastLocation = await this.prisma.locationHistory.findFirst({
      where: { tripId: trip.id },
      orderBy: { recordedAt: 'desc' },
    });

    const gpsMetadata = lastLocation
      ? {
          latitude: lastLocation.latitude,
          longitude: lastLocation.longitude,
          speed: lastLocation.speed,
          heading: lastLocation.heading,
          accuracy: lastLocation.accuracy,
          recordedAt: lastLocation.recordedAt.toISOString(),
        }
      : null;

    // Create a TripAudit record with action: 'SOS'.
    // Embed the last known GPS coordinates and timestamp into the JSON metadata field.
    const audit = await this.prisma.tripAudit.create({
      data: {
        tripId: trip.id,
        driverId: trip.driverId,
        action: 'SOS',
        timestamp: new Date(),
        metadata: {
          alert: 'EMERGENCY_SOS',
          triggeredByUserId: userId,
          lastKnownGps: gpsMetadata,
          timestamp: new Date().toISOString(),
          busId: trip.busId,
          plateNumber: trip.bus?.plateNumber,
          routeName: trip.route?.name,
        },
      },
    });

    // Emit an admin:sos event via WebSockets to alert dispatch
    this.tripsGateway.broadcastAdminSos({
      tripId: trip.id,
      busId: trip.busId,
      driverId: trip.driverId,
      plateNumber: trip.bus?.plateNumber,
      routeName: trip.route?.name,
      lastKnownGps: gpsMetadata,
      timestamp: new Date().toISOString(),
      auditId: audit.id,
    });

    return {
      success: true,
      message: 'Emergency SOS alert received and broadcast to dispatch',
      auditId: audit.id,
      timestamp: audit.timestamp,
    };
  }

  async getTripById(
    tripId: string,
    user?: { id?: string; sub?: string; role?: string },
  ) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        bus: true,
        route: {
          include: {
            routeStops: {
              include: { stop: true },
              orderBy: { sequence: 'asc' },
            },
          },
        },
        driver: {
          select: {
            id: true,
            name: true,
            phone: true,
            licenseNumber: true,
          },
        },
        boardings: true,
      },
    });

    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    const boardEventsCount = trip.boardings.filter((b) => b.type === BoardingEventType.BOARD).length;
    const dropEventsCount = trip.boardings.filter((b) => b.type === BoardingEventType.DROP).length;
    const capacity = trip.bus?.capacity || 50;
    const calc = calculateTripOccupancy(boardEventsCount, dropEventsCount, capacity);

    // Strip raw boardings records so no student PII is exposed to students/clients
    const { boardings: _boardings, ...sanitizedTrip } = trip;

    const result: typeof sanitizedTrip & {
      currentOccupancy?: number;
      occupancyPercent: number;
      occupancyPercentage: number;
      occupancyStatus: OccupancyCategory;
    } = {
      ...sanitizedTrip,
      occupancyPercent: calc.occupancyPercent,
      occupancyPercentage: calc.occupancyPercentage,
      occupancyStatus: calc.occupancyStatus,
    };

    // Suppress raw passenger headcounts for student & driver views
    if (!user || (user.role !== 'STUDENT' && user.role !== 'DRIVER')) {
      result.currentOccupancy = calc.netPassengers;
    }

    return result;
  }


  /**
   * Event-sourced dynamic occupancy calculation and WebSocket broadcast.
   */
  async calculateAndBroadcastOccupancy(
    tripId: string,
    _recentBoarding?: { stopId?: string | null; stopName?: string },
  ) {
    const boardEventsCount = await this.prisma.boardingEvent.count({
      where: {
        tripId,
        type: BoardingEventType.BOARD,
      },
    });

    const dropEventsCount = await this.prisma.boardingEvent.count({
      where: {
        tripId,
        type: BoardingEventType.DROP,
      },
    });

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { bus: true },
    });
    const capacity = trip?.bus?.capacity || 50;
    const calc = calculateTripOccupancy(boardEventsCount, dropEventsCount, capacity);

    const occupancyPayload: TripOccupancyPayload = {
      tripId,
      occupancyPercent: calc.occupancyPercent,
      occupancyStatus: calc.occupancyStatus,
      timestamp: new Date().toISOString(),
    };

    this.tripsGateway.broadcastOccupancy(tripId, occupancyPayload);

    return calc;
  }

  /**
   * Secure, idempotent student boarding check-in.
   * Derives student identity strictly from authenticated JWT subject.
   * Concurrency-safe via Prisma $transaction.
   */
  async boardTrip(
    tripId: string,
    userIdentifier: string,
    _clientBody?: any,
  ) {
    // 1. Resolve student profile strictly from authenticated identity
    const student = await this.prisma.student.findFirst({
      where: {
        OR: [
          { userId: userIdentifier },
          { id: userIdentifier },
        ],
      },
    });

    if (!student) {
      throw new BadRequestException('Student profile not found');
    }

    // 2. Pickup Validation: Fetch student's active PickupAssignment
    const pickupAssignment = await this.prisma.pickupAssignment.findFirst({
      where: {
        studentId: student.id,
        active: true,
      },
      include: {
        stop: true,
      },
    });

    if (!pickupAssignment) {
      throw new BadRequestException('No active pickup assignment');
    }

    // 3. Trip Validation: Trip must exist and be ACTIVE
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { bus: true },
    });

    if (!trip) {
      throw new NotFoundException(`Trip with ID '${tripId}' not found`);
    }

    if (trip.status !== TripStatus.ACTIVE) {
      throw new BadRequestException(
        `Trip '${tripId}' is not ACTIVE (current status: ${trip.status})`,
      );
    }

    // 4. Route Match Validation: Verify trip.routeId === pickupAssignment.routeId
    if (trip.routeId !== pickupAssignment.routeId) {
      throw new BadRequestException(
        'Student pickup stop does not belong to the route of this trip',
      );
    }

    // 5. Transactional Boarding Ingestion with Duplicate Protection
    const result = await this.prisma.$transaction(async (tx) => {
      // Advisory transaction lock serialized per student and trip to prevent parallel race conditions
      const lockKey = `boarding:${student.id}:${tripId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const boardCount = await tx.boardingEvent.count({
        where: {
          studentId: student.id,
          tripId,
          type: BoardingEventType.BOARD,
        },
      });

      const dropCount = await tx.boardingEvent.count({
        where: {
          studentId: student.id,
          tripId,
          type: BoardingEventType.DROP,
        },
      });

      // A student is currently on board if BOARD count > DROP count on this trip
      const isOnBoard = boardCount > dropCount;

      if (isOnBoard) {
        // Return existing board event idempotently without inserting duplicate
        const existingBoarding = await tx.boardingEvent.findFirst({
          where: {
            studentId: student.id,
            tripId,
            type: BoardingEventType.BOARD,
          },
          orderBy: { timestamp: 'desc' },
          include: { stop: true },
        });

        return {
          created: false,
          event: existingBoarding!,
          idempotent: true,
        };
      }

      const newBoarding = await tx.boardingEvent.create({
        data: {
          studentId: student.id,
          tripId,
          stopId: pickupAssignment.stopId,
          type: BoardingEventType.BOARD,
          method: BoardingMethod.APP,
          status: BoardingStatus.CONFIRMED,
        },
        include: { stop: true },
      });

      return {
        created: true,
        event: newBoarding,
        idempotent: false,
      };
    }, { maxWait: 20000, timeout: 30000 });

    // 6. Broadcast and notification handling
    if (result.created) {
      if (this.notificationsService) {
        await this.notificationsService.create(
          student.userId,
          'BOARDING_CONFIRMED',
          'Boarding Confirmed',
          'You have successfully checked in.',
          {
            tripId,
            stopId: pickupAssignment.stopId,
            method: BoardingMethod.APP,
          },
        );
      }

      this.tripsGateway.emitBoardingConfirmed(student.userId, {
        tripId,
        stopId: pickupAssignment.stopId,
        stopName: pickupAssignment.stop.name,
        timestamp: new Date().toISOString(),
      });

      const calc = await this.calculateAndBroadcastOccupancy(tripId, {
        stopId: pickupAssignment.stopId,
        stopName: pickupAssignment.stop.name,
      });

      return {
        success: true,
        event: result.event,
        idempotent: false,
        occupiedSeats: calc.netPassengers,
        occupancyPercent: calc.occupancyPercent,
        occupancyPercentage: calc.occupancyPercentage,
        occupancyStatus: calc.occupancyStatus,
      };
    }

    // Idempotent return without inflating occupancy
    const boardEventsCount = await this.prisma.boardingEvent.count({
      where: { tripId, type: BoardingEventType.BOARD },
    });
    const dropEventsCount = await this.prisma.boardingEvent.count({
      where: { tripId, type: BoardingEventType.DROP },
    });
    const capacity = trip.bus?.capacity || 50;
    const calc = calculateTripOccupancy(boardEventsCount, dropEventsCount, capacity);

    return {
      success: true,
      event: result.event,
      idempotent: true,
      occupiedSeats: calc.netPassengers,
      occupancyPercent: calc.occupancyPercent,
      occupancyPercentage: calc.occupancyPercentage,
      occupancyStatus: calc.occupancyStatus,
    };
  }

  /**
   * Secure, idempotent student drop check-out.
   * Concurrency-safe via Prisma $transaction.
   */
  async dropTrip(
    tripId: string,
    userIdentifier: string,
    _clientBody?: any,
  ) {
    // 1. Resolve student profile strictly from authenticated identity
    const student = await this.prisma.student.findFirst({
      where: {
        OR: [
          { userId: userIdentifier },
          { id: userIdentifier },
        ],
      },
    });

    if (!student) {
      throw new BadRequestException('Student profile not found');
    }

    // 2. Trip Validation: Must exist and be ACTIVE
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { bus: true },
    });

    if (!trip) {
      throw new NotFoundException(`Trip with ID '${tripId}' not found`);
    }

    if (trip.status !== TripStatus.ACTIVE) {
      throw new BadRequestException(
        `Trip '${tripId}' is not ACTIVE (current status: ${trip.status})`,
      );
    }

    // 3. Transactional Drop Ingestion with Duplicate Protection
    const result = await this.prisma.$transaction(async (tx) => {
      // Advisory transaction lock serialized per student and trip to prevent parallel race conditions
      const lockKey = `boarding:${student.id}:${tripId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const boardCount = await tx.boardingEvent.count({
        where: {
          studentId: student.id,
          tripId,
          type: BoardingEventType.BOARD,
        },
      });

      const dropCount = await tx.boardingEvent.count({
        where: {
          studentId: student.id,
          tripId,
          type: BoardingEventType.DROP,
        },
      });

      // Confirm that the student has an active BOARD event on this trip
      if (boardCount === 0) {
        throw new BadRequestException('Student is not currently boarded on this trip');
      }

      // If the student has already checked out (DROP count >= BOARD count), treat idempotently
      if (dropCount >= boardCount) {
        const existingDrop = await tx.boardingEvent.findFirst({
          where: {
            studentId: student.id,
            tripId,
            type: BoardingEventType.DROP,
          },
          orderBy: { timestamp: 'desc' },
          include: { stop: true },
        });

        return {
          created: false,
          event: existingDrop!,
          idempotent: true,
        };
      }

      const latestBoard = await tx.boardingEvent.findFirst({
        where: {
          studentId: student.id,
          tripId,
          type: BoardingEventType.BOARD,
        },
        orderBy: { timestamp: 'desc' },
      });

      const newDrop = await tx.boardingEvent.create({
        data: {
          studentId: student.id,
          tripId,
          stopId: latestBoard?.stopId,
          type: BoardingEventType.DROP,
          method: BoardingMethod.APP,
          status: BoardingStatus.CONFIRMED,
        },
        include: { stop: true },
      });

      return {
        created: true,
        event: newDrop,
        idempotent: false,
      };
    }, { maxWait: 20000, timeout: 30000 });

    // 4. Broadcast and notification handling
    if (result.created) {
      if (this.notificationsService) {
        await this.notificationsService.create(
          student.userId,
          'DROPOFF_CONFIRMED',
          'Drop-off Confirmed',
          'You have successfully checked out of the bus.',
          {
            tripId,
            stopId: result.event.stopId,
            method: BoardingMethod.APP,
          },
        );
      }

      this.tripsGateway.emitDropoffConfirmed(student.userId, {
        tripId,
        stopId: result.event.stopId,
        timestamp: new Date().toISOString(),
      });

      const calc = await this.calculateAndBroadcastOccupancy(tripId);

      return {
        success: true,
        event: result.event,
        idempotent: false,
        occupiedSeats: calc.netPassengers,
        occupancyPercent: calc.occupancyPercent,
        occupancyPercentage: calc.occupancyPercentage,
        occupancyStatus: calc.occupancyStatus,
      };
    }

    // Idempotent return without decrementing occupancy further
    const boardEventsCount = await this.prisma.boardingEvent.count({
      where: { tripId, type: BoardingEventType.BOARD },
    });
    const dropEventsCount = await this.prisma.boardingEvent.count({
      where: { tripId, type: BoardingEventType.DROP },
    });
    const capacity = trip.bus?.capacity || 50;
    const calc = calculateTripOccupancy(boardEventsCount, dropEventsCount, capacity);

    return {
      success: true,
      event: result.event,
      idempotent: true,
      occupiedSeats: calc.netPassengers,
      occupancyPercent: calc.occupancyPercent,
      occupancyPercentage: calc.occupancyPercentage,
      occupancyStatus: calc.occupancyStatus,
    };
  }
}


