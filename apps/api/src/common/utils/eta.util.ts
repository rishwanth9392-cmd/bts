import { calculateHaversineDistanceMeters } from './geo.util';
import type { DelayStatus } from '@bts/shared';

/**
 * Historical conservative urban campus speed in km/h.
 * Used when vehicle speed is below minimum threshold (e.g. stopped at traffic light)
 * or when GPS speed is missing or anomalous.
 */
export const DEFAULT_URBAN_SPEED_KMH = 25;

/** Speed below which vehicle is considered stopped or waiting at lights (< 3 km/h) */
export const MIN_VALID_SPEED_KMH = 3;

/** Impossibly fast speed for campus buses (> 120 km/h) representing GPS glitch spikes */
export const MAX_VALID_SPEED_KMH = 120;

/** Distance threshold in meters to consider vehicle off-route deviation */
export const DEVIATION_THRESHOLD_METERS = 1000;

/** Freshness thresholds in seconds */
export const FRESHNESS_LIVE_THRESHOLD_SECONDS = 30;
export const FRESHNESS_STALE_THRESHOLD_SECONDS = 120;

export type TelemetryFreshnessTier = 'LIVE' | 'STALE' | 'OFFLINE';

export interface TelemetryFreshnessEvaluation {
  tier: TelemetryFreshnessTier;
  freshness: TelemetryFreshnessTier;
  isStale: boolean;
  ageSeconds: number | null;
  status: 'ACTIVE' | 'STALE' | 'OFFLINE';
}

/**
 * Returns canonical freshness tier based on delta in seconds:
 * - 0s to 30s: LIVE (<= 30s)
 * - 31s to 120s: STALE (> 30s and <= 120s)
 * - > 120s: OFFLINE
 */
export function getFreshnessTier(diffSeconds: number): TelemetryFreshnessTier {
  if (diffSeconds <= FRESHNESS_LIVE_THRESHOLD_SECONDS) {
    return 'LIVE';
  }
  if (diffSeconds <= FRESHNESS_STALE_THRESHOLD_SECONDS) {
    return 'STALE';
  }
  return 'OFFLINE';
}

/**
 * Evaluates telemetry freshness against current wall-clock time.
 * Adheres strictly to unified boundary tiers:
 * - LIVE / ACTIVE: delta <= 30s
 * - STALE: 30s < delta <= 120s
 * - OFFLINE: delta > 120s (or missing/invalid timestamp)
 */
export function evaluateTelemetryFreshness(
  recordedAt: Date | string | number | null | undefined,
  now: Date | number = Date.now(),
): TelemetryFreshnessEvaluation {
  if (!recordedAt) {
    return {
      tier: 'OFFLINE',
      freshness: 'OFFLINE',
      isStale: true,
      ageSeconds: null,
      status: 'OFFLINE',
    };
  }

  const nowMs = typeof now === 'number' ? now : now.getTime();
  const recordedMs =
    typeof recordedAt === 'number'
      ? recordedAt
      : typeof recordedAt === 'string'
      ? new Date(recordedAt).getTime()
      : recordedAt.getTime();

  if (isNaN(recordedMs)) {
    return {
      tier: 'OFFLINE',
      freshness: 'OFFLINE',
      isStale: true,
      ageSeconds: null,
      status: 'OFFLINE',
    };
  }

  const ageSeconds = Math.max(0, (nowMs - recordedMs) / 1000);

  if (ageSeconds <= FRESHNESS_LIVE_THRESHOLD_SECONDS) {
    return {
      tier: 'LIVE',
      freshness: 'LIVE',
      isStale: false,
      ageSeconds: Math.floor(ageSeconds),
      status: 'ACTIVE',
    };
  }

  if (ageSeconds <= FRESHNESS_STALE_THRESHOLD_SECONDS) {
    return {
      tier: 'STALE',
      freshness: 'STALE',
      isStale: true,
      ageSeconds: Math.floor(ageSeconds),
      status: 'STALE',
    };
  }

  return {
    tier: 'OFFLINE',
    freshness: 'OFFLINE',
    isStale: true,
    ageSeconds: Math.floor(ageSeconds),
    status: 'OFFLINE',
  };
}

/**
 * Calculates a smoothed ETA in whole seconds (suppressed to null if stale/offline).
 */
export function calculateSmoothedEtaSeconds(
  distanceMeters: number,
  rawSpeedKmh?: number | null,
): number {
  const minutes = calculateSmoothedEtaMinutes(distanceMeters, rawSpeedKmh);
  return minutes * 60;
}

/**
 * Sanitizes and smooths raw GPS speed to prevent absurd ETA swings.
 * Falls back to historical urban average (25 km/h) if vehicle is stopped or speed is invalid.
 *
 * @param rawSpeedKmh Raw GPS speed reported by device in km/h
 * @returns Smoothed speed in km/h
 */
export function getSmoothedSpeedKmh(rawSpeedKmh?: number | null): number {
  if (
    rawSpeedKmh === null ||
    rawSpeedKmh === undefined ||
    isNaN(rawSpeedKmh) ||
    rawSpeedKmh < MIN_VALID_SPEED_KMH ||
    rawSpeedKmh > MAX_VALID_SPEED_KMH
  ) {
    return DEFAULT_URBAN_SPEED_KMH;
  }
  return rawSpeedKmh;
}

/**
 * Calculates a smoothed ETA in whole minutes.
 * Ensures zero false precision (integer minutes only).
 *
 * @param distanceMeters Distance to destination in meters
 * @param rawSpeedKmh Current raw GPS speed in km/h
 * @returns Integer ETA in minutes
 */
export function calculateSmoothedEtaMinutes(
  distanceMeters: number,
  rawSpeedKmh?: number | null,
): number {
  if (distanceMeters <= 0) {
    return 0;
  }

  const speedKmh = getSmoothedSpeedKmh(rawSpeedKmh);
  const speedMps = (speedKmh * 1000) / 3600; // convert km/h to m/s
  const durationSeconds = distanceMeters / speedMps;

  // Round to nearest integer minute (never return floating fractions like 7.432)
  const minutes = Math.round(durationSeconds / 60);

  // If vehicle is more than 50 meters away, minimum ETA is 1 minute
  if (minutes === 0 && distanceMeters > 50) {
    return 1;
  }

  return minutes;
}

/**
 * Calculates straight-line or segment distance between two coordinates in meters.
 */
export function calculateSegmentDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  return calculateHaversineDistanceMeters(lat1, lon1, lat2, lon2);
}

/**
 * Calculates total cumulative distance along a sequence of coordinates in meters.
 */
export function calculateSequentialDistanceMeters(
  points: Array<{ lat: number; lng: number }>,
): number {
  let totalDistance = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalDistance += calculateHaversineDistanceMeters(
      points[i].lat,
      points[i].lng,
      points[i + 1].lat,
      points[i + 1].lng,
    );
  }
  return totalDistance;
}

/**
 * Parses a scheduled time string (e.g. "07:15 AM", "7.37 AM", "14:30") into a Date object on referenceDate.
 * Handles both colon and dot separators, and AM/PM notations.
 */
export function parseScheduledTimeToDate(
  scheduledTimeStr?: string | null,
  referenceDate: Date = new Date(),
): Date | null {
  if (!scheduledTimeStr) return null;

  const trimmed = scheduledTimeStr.trim();
  const amPmMatch = trimmed.match(/(am|pm)/i);
  const isPM = amPmMatch && amPmMatch[0].toLowerCase() === 'pm';
  const isAM = amPmMatch && amPmMatch[0].toLowerCase() === 'am';

  const cleanTime = trimmed.replace(/(am|pm)/i, '').trim();
  const parts = cleanTime.split(/[:.]/);
  if (parts.length < 2) return null;

  let hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);

  if (isNaN(hours) || isNaN(minutes) || minutes < 0 || minutes > 59) {
    return null;
  }

  if (isPM && hours < 12) {
    hours += 12;
  } else if (isAM && hours === 12) {
    hours = 0;
  }

  const targetDate = new Date(referenceDate);
  targetDate.setHours(hours, minutes, 0, 0);
  return targetDate;
}

/**
 * Calculates delay status comparing estimated arrival to the scheduled time:
 * - If telemetry is STALE -> UNKNOWN
 * - If scheduledTime is missing/invalid or eta is null -> UNKNOWN
 * - If estimated arrival is > 10 minutes past the scheduledTime -> DELAYED
 * - Otherwise -> ON_TIME
 */
export function calculateDelayStatus(
  etaMinutes: number | null,
  scheduledTimeStr?: string | null,
  telemetryStatus: 'AVAILABLE' | 'STALE' | 'UNAVAILABLE' | 'LIVE' | 'OFFLINE' = 'AVAILABLE',
  now: Date = new Date(),
): DelayStatus {
  if (
    telemetryStatus === 'STALE' ||
    telemetryStatus === 'UNAVAILABLE' ||
    telemetryStatus === 'OFFLINE'
  ) {
    return 'UNKNOWN';
  }

  if (etaMinutes === null || !scheduledTimeStr) {
    return 'UNKNOWN';
  }

  const scheduledDate = parseScheduledTimeToDate(scheduledTimeStr, now);
  if (!scheduledDate) {
    return 'UNKNOWN';
  }

  // Estimated arrival = now + etaMinutes
  const estimatedArrivalMs = now.getTime() + etaMinutes * 60 * 1000;
  const scheduledTimeMs = scheduledDate.getTime();

  // If estimated arrival is > 10 minutes past scheduledTime
  const diffMinutes = (estimatedArrivalMs - scheduledTimeMs) / (60 * 1000);
  if (diffMinutes > 10) {
    return 'DELAYED';
  }

  return 'ON_TIME';
}

export type OccupancyCategory = 'SEATS_AVAILABLE' | 'STANDING_ROOM_ONLY' | 'FULL';

export interface TripOccupancyCalculation {
  netPassengers: number;
  capacity: number;
  occupancyPercentage: number;
  occupancyPercent: number;
  occupancyStatus: OccupancyCategory;
}

/**
 * Event-sourced dynamic occupancy calculation.
 * Ensures strictly non-negative net passenger count clamped to vehicle capacity:
 * netPassengers = max(0, min(capacity, boardCount - dropCount))
 * occupancyPercentage = min(100, round((netPassengers / capacity) * 100))
 */
export function calculateTripOccupancy(
  boardCount: number,
  dropCount: number,
  capacity: number = 50,
): TripOccupancyCalculation {
  const safeCapacity = Math.max(1, capacity);
  const netPassengers = Math.max(0, Math.min(safeCapacity, boardCount - dropCount));
  const occupancyPercentage = Math.min(100, Math.round((netPassengers / safeCapacity) * 100));

  let occupancyStatus: OccupancyCategory = 'SEATS_AVAILABLE';
  if (occupancyPercentage >= 100) {
    occupancyStatus = 'FULL';
  } else if (occupancyPercentage >= 70) {
    occupancyStatus = 'STANDING_ROOM_ONLY';
  }

  return {
    netPassengers,
    capacity: safeCapacity,
    occupancyPercentage,
    occupancyPercent: occupancyPercentage,
    occupancyStatus,
  };
}


