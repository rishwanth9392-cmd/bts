/**
 * Shared type definitions for the BTS system.
 *
 * These types are used across the web dashboard and the API.
 */

/** GPS coordinate pair */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Roles assignable to a user in the BTS system */
export type UserRole = 'admin' | 'driver' | 'student';

/** Minimal user representation shared between client and server */
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export type BusStatus = 'IDLE' | 'ON_ROUTE' | 'MAINTENANCE' | 'OFFLINE';
export type BoardingStatus = 'WAITING' | 'APPROACHING' | 'BOARDING' | 'BOARDED';

/** A bus in the tracking system */
export interface Bus {
  id: string;
  number?: string;
  plateNumber?: string;
  routeId?: string;
  capacity: number;
  occupancy: number;
  status: BusStatus;
  location?: LatLng;
}

/** Real-time location update payload */
export interface LocationUpdate {
  busId: string;
  position: LatLng;
  speed: number; // km/h
  heading: number; // degrees 0-360
  timestamp: string; // ISO 8601
}

/** Route information */
export interface Route {
  id: string;
  name: string;
  code?: string;
  stops: string[];
}

export interface BoardingState {
  status: BoardingStatus;
  eta: number; // minutes
  pickupStop: string;
}

export interface StopDetail {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  radiusMeters?: number | null;
  sequence?: number;
  description?: string | null;
}

export interface RouteStopDetail {
  id: string;
  routeId: string;
  stopId: string;
  sequence: number;
  scheduledTime?: string | null;
  stop: StopDetail;
}

export interface RouteDetail {
  id: string;
  name: string;
  code?: string;
  description?: string | null;
  active?: boolean;
  routeStops: RouteStopDetail[];
}

export interface PickupAssignmentDetail {
  id: string;
  studentId: string;
  routeId: string;
  stopId: string;
  active?: boolean;
  scheduledTime?: string | null;
  route: RouteDetail;
  stop: StopDetail;
  createdAt: string;
  updatedAt: string;
}

