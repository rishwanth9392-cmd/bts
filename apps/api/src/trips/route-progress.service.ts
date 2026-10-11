import {
  Injectable,
  Inject,
  forwardRef,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { GeofenceService } from './geofence.service';
import { TripsGateway } from './trips.gateway';
import { TripStatus } from '@prisma/client';
import { calculateHaversineDistanceMeters } from '../common/utils/geo.util';
import {
  calculateSmoothedEtaMinutes,
  calculateDelayStatus,
  evaluateTelemetryFreshness,
  DEVIATION_THRESHOLD_METERS,
} from '../common/utils/eta.util';
import type {
  TripProgressPayload,
  StudentEtaPayload,
  DelayStatus,
  TelemetryFreshness,
} from '@bts/shared';

export type TripProgressStatus = 'AVAILABLE' | 'STALE' | 'UNAVAILABLE';
export type { TripProgressPayload };

@Injectable()
export class RouteProgressService {
  private readonly logger = new Logger(RouteProgressService.name);

  // In-memory tracking of entered and exited stops per trip
  private readonly tripStopHistory = new Map<
    string,
    { entered: Set<string>; exited: Set<string> }
  >();

  // In-memory cache for trip progress broadcast state
  private readonly lastProgressBroadcastMap = new Map<
    string,
    {
      nextStopId: string | null;
      routeProgressPercentage: number;
      deviation: boolean;
      status: string;
      delayStatus: DelayStatus;
      isStale?: boolean;
      freshness?: string;
    }
  >();

  // In-memory cache for student ETA broadcast state (keyed by studentId)
  private readonly lastStudentEtaBroadcastMap = new Map<
    string,
    {
      etaMinutes: number | null;
      state: string;
    }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly geofenceService: GeofenceService,
    @Inject(forwardRef(() => TripsGateway))
    private readonly tripsGateway: TripsGateway,
  ) {}

  private getTripHistory(tripId: string) {
    if (!this.tripStopHistory.has(tripId)) {
      this.tripStopHistory.set(tripId, {
        entered: new Set<string>(),
        exited: new Set<string>(),
      });
    }
    return this.tripStopHistory.get(tripId)!;
  }

  /**
   * Cleans up tracking cache when a trip stops or completes.
   */
  clearTripState(tripId: string): void {
    this.tripStopHistory.delete(tripId);
    this.lastProgressBroadcastMap.delete(tripId);
  }

  /**
   * Calculates the current route progress, previous/next stops, ETA, delay status, and deviation for an active trip.
   */
  async getTripProgress(tripId: string): Promise<TripProgressPayload> {
    // 1. Fetch trip, route, and sequenced routeStops
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
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

    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    const routeStops = trip.route?.routeStops || [];
    const validStops = routeStops.filter(
      (rs) => rs.stop.lat !== null && rs.stop.lng !== null,
    );

    // 2. Fetch latest vehicle location
    const latestLocation = await this.prisma.locationHistory.findFirst({
      where: { tripId },
      orderBy: { recordedAt: 'desc' },
    });

    if (!latestLocation || trip.status !== TripStatus.ACTIVE) {
      return {
        tripId,
        previousStopId: null,
        nextStopId: validStops[0]?.stopId || null,
        routeProgressPercentage: 0,
        deviation: false,
        status: 'UNAVAILABLE',
        freshness: 'OFFLINE',
        isStale: true,
        delayStatus: 'UNKNOWN',
        nextStopEtaMinutes: null,
        etaSeconds: null,
      };
    }

    // Check GPS telemetry freshness adhering strictly to unified boundary tiers
    const evaluation = evaluateTelemetryFreshness(latestLocation.recordedAt);
    const freshness: TelemetryFreshness = evaluation.freshness;
    const isStale = evaluation.isStale;
    const status: TripProgressStatus =
      freshness === 'OFFLINE'
        ? 'UNAVAILABLE'
        : freshness === 'STALE'
        ? 'STALE'
        : 'AVAILABLE';

    if (validStops.length === 0) {
      return {
        tripId,
        previousStopId: null,
        nextStopId: null,
        routeProgressPercentage: 0,
        deviation: false,
        status,
        freshness,
        isStale,
        delayStatus: 'UNKNOWN',
        nextStopEtaMinutes: null,
        etaSeconds: null,
      };
    }

    const history = this.getTripHistory(tripId);
    const busLat = latestLocation.latitude;
    const busLng = latestLocation.longitude;

    // 3. Compute distance to each stop and find closest physical stop in sequence
    let minDistanceMeters = Infinity;
    let closestIndex = 0;

    validStops.forEach((rs, idx) => {
      const distance = calculateHaversineDistanceMeters(
        busLat,
        busLng,
        rs.stop.lat!,
        rs.stop.lng!,
      );

      if (distance < minDistanceMeters) {
        minDistanceMeters = distance;
        closestIndex = idx;
      }

      // Sync geofence state
      const isEntered = this.geofenceService.isStopEntered(tripId, rs.stopId);
      if (isEntered) {
        history.entered.add(rs.stopId);
      } else if (history.entered.has(rs.stopId)) {
        history.exited.add(rs.stopId);
      }
    });

    // 4. Deviation detection: distance to closest stop segment exceeds threshold (1000m)
    const deviation = minDistanceMeters > DEVIATION_THRESHOLD_METERS;

    // 5. Determine PASSED stops according to core rules:
    // A stop is PASSED if:
    // a) The closest physical stop on the sequence is a higher index (i < closestIndex), OR
    // b) The stop was previously entered and has now exited.
    let lastPassedIndex = -1;

    for (let i = 0; i < validStops.length; i++) {
      const stopId = validStops[i].stopId;
      const isLowerThanClosest = i < closestIndex;
      const hasExitedGeofence = history.exited.has(stopId);

      if (isLowerThanClosest || hasExitedGeofence) {
        lastPassedIndex = i;
      } else {
        // First non-passed stop encountered
        break;
      }
    }

    // 6. Resolve previousStopId and nextStopId
    const previousStopId =
      lastPassedIndex >= 0 ? validStops[lastPassedIndex].stopId : null;

    const nextStopIndex = lastPassedIndex + 1;
    const nextStop =
      nextStopIndex < validStops.length ? validStops[nextStopIndex] : null;
    const nextStopId = nextStop ? nextStop.stopId : null;

    // 7. Calculate route progress percentage (passed stops / total stops)
    const passedCount = lastPassedIndex + 1;
    const routeProgressPercentage = Math.round(
      (passedCount / validStops.length) * 100,
    );

    // 8. Calculate ETA to next stop (suppressed if OFFLINE)
    let nextStopEtaMinutes: number | null = null;
    let etaSeconds: number | null = null;

    if (freshness !== 'OFFLINE' && nextStop && nextStop.stop.lat !== null && nextStop.stop.lng !== null) {
      const distanceToNext = calculateHaversineDistanceMeters(
        busLat,
        busLng,
        nextStop.stop.lat,
        nextStop.stop.lng,
      );
      nextStopEtaMinutes = calculateSmoothedEtaMinutes(
        distanceToNext,
        latestLocation.speed,
      );
      etaSeconds = nextStopEtaMinutes * 60;
    }

    // 9. Delay detection against BMSIT schedule for next stop (UNKNOWN if STALE or OFFLINE)
    const delayStatus = calculateDelayStatus(
      nextStopEtaMinutes,
      nextStop?.scheduledTime,
      freshness,
    );

    return {
      tripId,
      previousStopId,
      nextStopId,
      routeProgressPercentage,
      deviation,
      status,
      freshness,
      isStale,
      delayStatus,
      nextStopEtaMinutes,
      etaSeconds,
    };
  }

  /**
   * Processes a newly recorded GPS location for an active trip.
   * Evaluates route progress, delay status, and broadcasts throttled updates to:
   * 1. Global room trip:${tripId} (trip:progress)
   * 2. Private rooms user:${studentId} (student:eta)
   */
  async processLocationUpdate(
    tripId: string,
    latestLocation?: { latitude: number; longitude: number; speed?: number | null },
  ): Promise<void> {
    try {
      const progress = await this.getTripProgress(tripId);

      // ── 1. Throttled Global Progress Broadcast (trip:progress) ─────────────
      const lastProgress = this.lastProgressBroadcastMap.get(tripId);
      const shouldEmitProgress =
        !lastProgress ||
        lastProgress.nextStopId !== progress.nextStopId ||
        Math.abs(progress.routeProgressPercentage - lastProgress.routeProgressPercentage) >= 2 ||
        lastProgress.deviation !== progress.deviation ||
        lastProgress.delayStatus !== progress.delayStatus ||
        lastProgress.status !== progress.status ||
        lastProgress.isStale !== progress.isStale ||
        lastProgress.freshness !== progress.freshness;

      if (shouldEmitProgress) {
        this.lastProgressBroadcastMap.set(tripId, {
          nextStopId: progress.nextStopId,
          routeProgressPercentage: progress.routeProgressPercentage,
          deviation: progress.deviation,
          status: progress.status,
          delayStatus: progress.delayStatus,
          isStale: progress.isStale,
          freshness: progress.freshness,
        });

        this.tripsGateway.broadcastTripProgress(tripId, progress);
      }

      // ── 2. Throttled Private Student ETA Broadcast (student:eta) ───────────
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
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

      if (!trip || !trip.route) return;

      const assignments = await this.prisma.pickupAssignment.findMany({
        where: {
          routeId: trip.routeId,
          active: true,
        },
        include: {
          student: {
            include: {
              user: true,
            },
          },
          stop: true,
        },
      });

      if (assignments.length === 0) return;

      const routeStops = trip.route.routeStops || [];
      const busLocation =
        latestLocation ||
        (await this.prisma.locationHistory.findFirst({
          where: { tripId },
          orderBy: { recordedAt: 'desc' },
        }));

      if (!busLocation) return;

      for (const assignment of assignments) {
        const studentStopIndex = routeStops.findIndex(
          (rs) => rs.stopId === assignment.stopId,
        );

        if (studentStopIndex === -1) {
          continue;
        }

        // Determine if student's stop has been passed
        let isPassed = false;
        if (progress.previousStopId) {
          const prevIndex = routeStops.findIndex(
            (rs) => rs.stopId === progress.previousStopId,
          );
          if (prevIndex >= studentStopIndex) {
            isPassed = true;
          }
        } else if (progress.nextStopId === null) {
          isPassed = true;
        }

        let state: 'AVAILABLE' | 'CALCULATING' | 'STALE' | 'UNAVAILABLE' | 'PASSED' =
          progress.status;
        let etaMinutes: number | null = null;
        let totalDistanceMeters = 0;

        if (isPassed) {
          state = 'PASSED';
          etaMinutes = 0;
        } else if (progress.freshness === 'OFFLINE') {
          state = 'UNAVAILABLE';
          etaMinutes = null;
        } else {
          let nextIndex = 0;
          if (progress.nextStopId) {
            const idx = routeStops.findIndex(
              (rs) => rs.stopId === progress.nextStopId,
            );
            if (idx !== -1) nextIndex = idx;
          }

          // Distance from bus to next stop
          const nextRouteStop = routeStops[nextIndex];
          if (nextRouteStop?.stop?.lat && nextRouteStop?.stop?.lng) {
            totalDistanceMeters += calculateHaversineDistanceMeters(
              busLocation.latitude,
              busLocation.longitude,
              nextRouteStop.stop.lat,
              nextRouteStop.stop.lng,
            );
          }

          // Sequential distances from next stop to student's stop
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

          etaMinutes = calculateSmoothedEtaMinutes(
            totalDistanceMeters,
            busLocation.speed,
          );

          if (progress.freshness === 'STALE') {
            state = 'STALE';
          }
        }

        // Evaluate throttling: emit only if eta changes by >= 1 min or state changes
        const lastStudent = this.lastStudentEtaBroadcastMap.get(
          assignment.studentId,
        );

        const shouldEmitStudent =
          !lastStudent ||
          lastStudent.state !== state ||
          (lastStudent.etaMinutes === null && etaMinutes !== null) ||
          (lastStudent.etaMinutes !== null && etaMinutes === null) ||
          (lastStudent.etaMinutes !== null &&
            etaMinutes !== null &&
            Math.abs(etaMinutes - lastStudent.etaMinutes) >= 1);

        if (shouldEmitStudent) {
          this.lastStudentEtaBroadcastMap.set(assignment.studentId, {
            etaMinutes,
            state,
          });

          const studentPayload: StudentEtaPayload = {
            tripId,
            etaMinutes,
            etaSeconds: etaMinutes !== null ? etaMinutes * 60 : null,
            state,
            freshness: progress.freshness,
            isStale: progress.isStale ?? (state === 'STALE' || state === 'UNAVAILABLE'),
            stopId: assignment.stopId,
            stopName: assignment.stop?.name,
            distanceMeters: Math.round(totalDistanceMeters),
          };

          // NEVER broadcast private student ETA to the global trip room
          this.tripsGateway.emitStudentEta(
            assignment.student.userId,
            assignment.studentId,
            studentPayload,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to process location update for trip ${tripId}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
