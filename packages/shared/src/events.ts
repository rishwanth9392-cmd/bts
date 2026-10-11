/**
 * WebSocket event constants for realtime telemetry and trip lifecycle.
 */
export const TRIP_LOCATION = 'trip:location';
export const TRIP_STARTED = 'trip:started';
export const TRIP_STOPPED = 'trip:stopped';
export const TRIP_COMPLETED = 'trip:completed';

export const TRIP_SUBSCRIBE = 'trip:subscribe';
export const TRIP_UNSUBSCRIBE = 'trip:unsubscribe';

export const USER_SUBSCRIBE = 'user:subscribe';
export const USER_UNSUBSCRIBE = 'user:unsubscribe';
export const PICKUP_ARRIVED = 'pickup:arrived';

export interface PickupArrivedPayload {
  tripId: string;
  routeId: string;
  stopId: string;
  stopName?: string;
  distanceMeters: number;
  occurredAt: string | Date;
}

export interface TripLocationPayload {
  tripId: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  recordedAt: string;
  status: 'ACTIVE' | 'STALE' | 'OFFLINE';
}

export interface TripLifecyclePayload {
  tripId: string;
  status: string;
  timestamp: string;
}

export const TRIP_OCCUPANCY = 'trip:occupancy';

export interface TripOccupancyPayload {
  tripId: string;
  occupancyPercent: number;
  occupancyStatus: 'SEATS_AVAILABLE' | 'STANDING_ROOM_ONLY' | 'FULL';
  timestamp: string;
  occupiedSeats?: number;
  capacity?: number;
  occupancyPercentage?: number;
  recentBoarding?: {
    stopId: string;
    stopName?: string;
  };
}

export const NOTIFICATION_NEW = 'notification:new';

export interface NotificationPayload {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  readAt: string | Date | null;
  createdAt: string | Date;
  metadata?: any;
}

export const TRIP_PROGRESS = 'trip:progress';
export const STUDENT_ETA = 'student:eta';

export type DelayStatus = 'ON_TIME' | 'DELAYED' | 'UNKNOWN';
export type TelemetryFreshness = 'LIVE' | 'STALE' | 'OFFLINE';

export interface TripProgressPayload {
  tripId: string;
  previousStopId?: string | null;
  nextStopId: string | null;
  routeProgressPercentage: number;
  deviation: boolean;
  status: 'AVAILABLE' | 'STALE' | 'UNAVAILABLE';
  delayStatus: DelayStatus;
  nextStopEtaMinutes?: number | null;
  etaSeconds?: number | null;
  isStale?: boolean;
  freshness?: TelemetryFreshness;
}

export interface StudentEtaPayload {
  tripId: string;
  etaMinutes: number | null;
  state: 'AVAILABLE' | 'CALCULATING' | 'STALE' | 'UNAVAILABLE' | 'PASSED';
  stopId?: string;
  stopName?: string;
  distanceMeters?: number | null;
  etaSeconds?: number | null;
  isStale?: boolean;
  freshness?: TelemetryFreshness;
}

export const TELEMETRY_STALE = 'telemetry:stale';
export const TELEMETRY_OFFLINE = 'telemetry:offline';
export const TELEMETRY_LIVE = 'telemetry:live';
export const TELEMETRY_RECOVERED = 'telemetry:recovered';

export interface TelemetryWarningPayload {
  tripId: string;
  busId?: string;
  plateNumber?: string;
  routeName?: string;
  previousState: TelemetryFreshness;
  currentState: TelemetryFreshness;
  ageSeconds: number | null;
  timestamp: string;
}

export const ADMIN_SOS = 'admin:sos';

export interface AdminSosPayload {
  tripId: string;
  busId: string;
  driverId: string;
  plateNumber?: string;
  routeName?: string;
  lastKnownGps?: {
    latitude: number;
    longitude: number;
    speed?: number | null;
    heading?: number | null;
    accuracy?: number | null;
    recordedAt: string;
  } | null;
  timestamp: string;
  auditId?: string;
}


