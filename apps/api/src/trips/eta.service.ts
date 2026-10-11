import {
  Injectable,
  Logger,
  Optional,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { TripsGateway } from './trips.gateway';
import {
  evaluateTelemetryFreshness,
  getFreshnessTier,
  calculateSmoothedEtaMinutes,
  calculateDelayStatus,
  TelemetryFreshnessTier,
  TelemetryFreshnessEvaluation,
} from '../common/utils/eta.util';
import {
  TELEMETRY_STALE,
  TELEMETRY_OFFLINE,
  TELEMETRY_RECOVERED,
  TelemetryWarningPayload,
  DelayStatus,
} from '@bts/shared';
import { TripStatus } from '@prisma/client';

export interface GuardedEtaResult {
  freshness: TelemetryFreshnessTier;
  isStale: boolean;
  etaMinutes: number | null;
  etaSeconds: number | null;
  delayStatus: DelayStatus;
}

export interface StateTransitionResult {
  transitioned: boolean;
  previousState: TelemetryFreshnessTier | null;
  currentState: TelemetryFreshnessTier;
  event?: string;
  payload?: TelemetryWarningPayload;
}

@Injectable()
export class EtaService {
  private readonly logger = new Logger(EtaService.name);

  // In-memory state tracking per trip for warning throttling & deduplication
  private readonly tripFreshnessMap = new Map<string, TelemetryFreshnessTier>();

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional()
    @Inject(forwardRef(() => TripsGateway))
    private readonly tripsGateway?: TripsGateway,
  ) {}

  /**
   * Evaluates freshness tiers strictly according to domain standard:
   * - LIVE / ACTIVE: delta <= 30s
   * - STALE: 30s < delta <= 120s
   * - OFFLINE: delta > 120s (or missing/invalid)
   */
  evaluateFreshness(
    recordedAt?: Date | string | number | null,
    now: Date | number = Date.now(),
  ): TelemetryFreshnessEvaluation {
    return evaluateTelemetryFreshness(recordedAt, now);
  }

  /**
   * Helper to map age in seconds to freshness tier:
   * - 0s to 30s: LIVE
   * - 31s to 120s: STALE
   * - > 120s: OFFLINE
   */
  getFreshnessTier(diffSeconds: number): TelemetryFreshnessTier {
    return getFreshnessTier(diffSeconds);
  }

  /**
   * Computes guarded ETA and student delay confidence:
   * - Never fabricates or dead-reckons coordinates forward.
   * - LIVE (<= 30s): Smooth integer ETA, isStale: false, freshness: 'LIVE', accurate delayStatus.
   * - STALE (31s - 120s): Stale integer ETA retained, isStale: true, freshness: 'STALE', delayStatus: 'UNKNOWN'.
   * - OFFLINE (> 120s): Suppresses ETA (etaMinutes: null, etaSeconds: null), isStale: true, freshness: 'OFFLINE', delayStatus: 'UNKNOWN'.
   * - Recovery: Transitions immediately back to LIVE with restored ETA and cleared stale flags.
   */
  calculateGuardedEta(params: {
    distanceMeters: number;
    speedKmh?: number | null;
    recordedAt?: Date | string | number | null;
    scheduledTime?: string | null;
    now?: Date | number;
  }): GuardedEtaResult {
    const { distanceMeters, speedKmh, recordedAt, scheduledTime, now = Date.now() } = params;

    const evaluation = this.evaluateFreshness(recordedAt, now);

    if (evaluation.freshness === 'OFFLINE') {
      return {
        freshness: 'OFFLINE',
        isStale: true,
        etaMinutes: null,
        etaSeconds: null,
        delayStatus: 'UNKNOWN',
      };
    }

    if (evaluation.freshness === 'STALE') {
      const etaMinutes = calculateSmoothedEtaMinutes(distanceMeters, speedKmh);
      return {
        freshness: 'STALE',
        isStale: true,
        etaMinutes,
        etaSeconds: etaMinutes * 60,
        delayStatus: 'UNKNOWN',
      };
    }

    // LIVE / ACTIVE state
    const etaMinutes = calculateSmoothedEtaMinutes(distanceMeters, speedKmh);
    const targetDate = typeof now === 'number' ? new Date(now) : now;
    const delayStatus = calculateDelayStatus(etaMinutes, scheduledTime, 'LIVE', targetDate);

    return {
      freshness: 'LIVE',
      isStale: false,
      etaMinutes,
      etaSeconds: etaMinutes * 60,
      delayStatus,
    };
  }

  /**
   * State-Transition Throttling & Deduplication:
   * Emits warnings to dispatchers/admins strictly on state transitions:
   * - LIVE -> STALE (telemetry:stale)
   * - STALE -> OFFLINE / LIVE -> OFFLINE (telemetry:offline)
   * - OFFLINE/STALE -> LIVE recovery (telemetry:recovered)
   * Deduplicates repeated checks within the same state to prevent alert spam across recurring intervals.
   */
  evaluateTransitionAndAlert(
    tripId: string,
    currentFreshness: TelemetryFreshnessTier,
    metadata?: {
      busId?: string;
      plateNumber?: string;
      routeName?: string;
      ageSeconds?: number | null;
      timestamp?: string;
    },
  ): StateTransitionResult {
    const previousState = this.tripFreshnessMap.get(tripId) ?? null;

    // If trip was not previously tracked:
    if (!previousState) {
      this.tripFreshnessMap.set(tripId, currentFreshness);
      if (currentFreshness === 'LIVE') {
        // Initial healthy registration: no warning needed
        return {
          transitioned: false,
          previousState: null,
          currentState: 'LIVE',
        };
      }

      // Initial degraded registration: emit warning
      const event =
        currentFreshness === 'STALE' ? TELEMETRY_STALE : TELEMETRY_OFFLINE;
      const payload: TelemetryWarningPayload = {
        tripId,
        busId: metadata?.busId,
        plateNumber: metadata?.plateNumber,
        routeName: metadata?.routeName,
        previousState: 'LIVE',
        currentState: currentFreshness,
        ageSeconds: metadata?.ageSeconds ?? null,
        timestamp: metadata?.timestamp || new Date().toISOString(),
      };

      if (this.tripsGateway) {
        this.tripsGateway.broadcastTelemetryWarning(event, payload);
      }

      return {
        transitioned: true,
        previousState: 'LIVE',
        currentState: currentFreshness,
        event,
        payload,
      };
    }

    // Same state: deduplicate and suppress alert
    if (previousState === currentFreshness) {
      return {
        transitioned: false,
        previousState,
        currentState: currentFreshness,
      };
    }

    // State transition detected: update tracking cache
    this.tripFreshnessMap.set(tripId, currentFreshness);

    let event: string;
    if (currentFreshness === 'STALE') {
      event = TELEMETRY_STALE;
    } else if (currentFreshness === 'OFFLINE') {
      event = TELEMETRY_OFFLINE;
    } else {
      // Transitioned back to LIVE (Recovery)
      event = TELEMETRY_RECOVERED;
    }

    const payload: TelemetryWarningPayload = {
      tripId,
      busId: metadata?.busId,
      plateNumber: metadata?.plateNumber,
      routeName: metadata?.routeName,
      previousState,
      currentState: currentFreshness,
      ageSeconds: metadata?.ageSeconds ?? null,
      timestamp: metadata?.timestamp || new Date().toISOString(),
    };

    if (this.tripsGateway) {
      this.tripsGateway.broadcastTelemetryWarning(event, payload);
    }

    this.logger.warn(
      `Trip ${tripId} telemetry state transition: ${previousState} -> ${currentFreshness} (Event: ${event})`,
    );

    return {
      transitioned: true,
      previousState,
      currentState: currentFreshness,
      event,
      payload,
    };
  }

  /**
   * Resets in-memory telemetry state for a completed or cancelled trip.
   */
  clearTripState(tripId: string): void {
    this.tripFreshnessMap.delete(tripId);
  }

  /**
   * Retrieves the current in-memory freshness state for a trip.
   */
  getTripFreshnessState(tripId: string): TelemetryFreshnessTier | undefined {
    return this.tripFreshnessMap.get(tripId);
  }

  /**
   * Explicitly sets the in-memory freshness state for testing or seeding.
   */
  setTripFreshnessState(tripId: string, state: TelemetryFreshnessTier): void {
    this.tripFreshnessMap.set(tripId, state);
  }

  /**
   * Iterates through active trips and evaluates telemetry freshness with throttled alerts.
   * Can be invoked periodically by background loops or dispatch health checks.
   */
  async monitorFleetTelemetry(now: Date | number = Date.now()): Promise<{
    checked: number;
    transitions: StateTransitionResult[];
  }> {
    if (!this.prisma) {
      return { checked: 0, transitions: [] };
    }

    const activeTrips = await this.prisma.trip.findMany({
      where: { status: TripStatus.ACTIVE },
      include: {
        bus: true,
        route: true,
        locationHistory: {
          take: 1,
          orderBy: { recordedAt: 'desc' },
        },
      },
    });

    const transitions: StateTransitionResult[] = [];

    for (const trip of activeTrips) {
      const latest = trip.locationHistory[0];
      const evaluation = this.evaluateFreshness(latest?.recordedAt, now);

      const result = this.evaluateTransitionAndAlert(
        trip.id,
        evaluation.freshness,
        {
          busId: trip.busId,
          plateNumber: trip.bus?.plateNumber,
          routeName: trip.route?.name,
          ageSeconds: evaluation.ageSeconds,
          timestamp: new Date(typeof now === 'number' ? now : now.getTime()).toISOString(),
        },
      );

      if (result.transitioned) {
        transitions.push(result);
      }
    }

    return {
      checked: activeTrips.length,
      transitions,
    };
  }
}
