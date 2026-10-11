import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { TripsGateway } from './trips.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import {
  calculateHaversineDistanceMeters,
  GEOFENCE_RADIUS_METERS,
  GEOFENCE_EXIT_THRESHOLD_METERS,
} from '../common/utils/geo.util';
import type { PickupArrivedPayload } from '@bts/shared';

@Injectable()
export class GeofenceService {
  private readonly logger = new Logger(GeofenceService.name);

  // In-memory cache tracking ENTERED state per (tripId_stopId)
  private readonly geofenceStateCache = new Map<string, boolean>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripsGateway: TripsGateway,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Evaluates geofence proximity for all assigned stops on the trip's route.
   * Emits pickup:arrived events when an OUTSIDE -> ENTERED transition occurs.
   *
   * @param tripId Active trip identifier
   * @param routeId Route identifier for the active trip
   * @param latitude Current vehicle latitude
   * @param longitude Current vehicle longitude
   */
  async processLocationUpdate(
    tripId: string,
    routeId: string,
    latitude: number,
    longitude: number,
  ): Promise<void> {
    try {
      // 1. Optimized query: Query PickupAssignments on this route where stop has valid lat/lng
      const assignments = await this.prisma.pickupAssignment.findMany({
        where: {
          routeId,
          active: true,
          stop: {
            lat: { not: null },
            lng: { not: null },
          },
        },
        include: {
          stop: true,
          student: {
            include: {
              user: true,
            },
          },
        },
      });

      if (assignments.length === 0) {
        return;
      }

      // 2. Group assignments by stopId
      const stopMap = new Map<
        string,
        {
          stopId: string;
          stopName: string;
          lat: number;
          lng: number;
          studentUserIds: string[];
          studentIds: string[];
        }
      >();

      for (const assignment of assignments) {
        if (!assignment.stop.lat || !assignment.stop.lng) continue;

        if (!stopMap.has(assignment.stopId)) {
          stopMap.set(assignment.stopId, {
            stopId: assignment.stopId,
            stopName: assignment.stop.name,
            lat: assignment.stop.lat,
            lng: assignment.stop.lng,
            studentUserIds: [],
            studentIds: [],
          });
        }

        const entry = stopMap.get(assignment.stopId)!;
        if (assignment.student?.userId && !entry.studentUserIds.includes(assignment.student.userId)) {
          entry.studentUserIds.push(assignment.student.userId);
        }
        if (assignment.studentId && !entry.studentIds.includes(assignment.studentId)) {
          entry.studentIds.push(assignment.studentId);
        }
      }

      // 3. Evaluate distance and state transitions for each stop
      for (const stopData of stopMap.values()) {
        const distanceMeters = calculateHaversineDistanceMeters(
          latitude,
          longitude,
          stopData.lat,
          stopData.lng,
        );

        const cacheKey = `${tripId}_${stopData.stopId}`;
        const isCurrentlyEntered = this.geofenceStateCache.get(cacheKey) || false;

        // Transition 1: OUTSIDE -> ENTERED
        if (distanceMeters <= GEOFENCE_RADIUS_METERS && !isCurrentlyEntered) {
          this.geofenceStateCache.set(cacheKey, true);
          this.logger.log(
            `[GEOFENCE ENTERED] Trip ${tripId} entered stop "${stopData.stopName}" (${stopData.stopId}) at ${Math.round(distanceMeters)}m (radius: ${GEOFENCE_RADIUS_METERS}m)`,
          );

          const payload: PickupArrivedPayload = {
            tripId,
            routeId,
            stopId: stopData.stopId,
            stopName: stopData.stopName,
            distanceMeters: Math.round(distanceMeters),
            occurredAt: new Date(),
          };

          // Broadcast targeted arrival notification to assigned students
          const notifiedRooms = new Set<string>();
          for (const userId of stopData.studentUserIds) {
            notifiedRooms.add(userId);
            this.tripsGateway.emitPickupArrived(userId, payload);
            await this.notificationsService.create(
              userId,
              'BUS_NEAR_PICKUP',
              'Bus Approaching Stop',
              `Your bus is approaching ${stopData.stopName}.`,
              {
                tripId,
                routeId,
                stopId: stopData.stopId,
                stopName: stopData.stopName,
                distanceMeters: Math.round(distanceMeters),
              },
            );
          }
          for (const studentId of stopData.studentIds) {
            if (!notifiedRooms.has(studentId)) {
              this.tripsGateway.emitPickupArrived(studentId, payload);
            }
          }
        }
        // Transition 2: ENTERED -> OUTSIDE (with 50m hysteresis buffer)
        else if (distanceMeters > GEOFENCE_EXIT_THRESHOLD_METERS && isCurrentlyEntered) {
          this.geofenceStateCache.set(cacheKey, false);
          this.logger.log(
            `[GEOFENCE EXITED] Trip ${tripId} exited stop "${stopData.stopName}" (${stopData.stopId}) at ${Math.round(distanceMeters)}m -> OUTSIDE (threshold: ${GEOFENCE_EXIT_THRESHOLD_METERS}m)`,
          );
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      this.logger.error(`Geofence processing error for trip ${tripId}: ${message}`, stack);
    }
  }

  /**
   * Resets the geofence hysteresis cache for a completed/stopped trip.
   */
  clearTripGeofenceState(tripId: string): void {
    for (const key of this.geofenceStateCache.keys()) {
      if (key.startsWith(`${tripId}_`)) {
        this.geofenceStateCache.delete(key);
      }
    }
  }

  /**
   * Returns current geofence state for a trip and stop (useful for testing/status).
   */
  isStopEntered(tripId: string, stopId: string): boolean {
    return this.geofenceStateCache.get(`${tripId}_${stopId}`) || false;
  }
}
