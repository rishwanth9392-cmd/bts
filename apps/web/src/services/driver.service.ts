'use server';

import type { Bus, Route } from '@bts/shared';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface DriverDashboardTripData {
  trip: {
    id: string;
    status: 'SCHEDULED' | 'READY' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | string;
    startTime?: string | null;
    endTime?: string | null;
  };
  bus: Bus & { plateNumber?: string; occupancy?: number };
  route: Route & { stops?: string[]; routeStops?: any[] };
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const cookieStore = await cookies();
  const token = cookieStore.get('bts_session_token')?.value;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

const DEV_MOCK_DRIVER_TRIP: DriverDashboardTripData = {
  trip: {
    id: 'trip_demo_101',
    status: 'ACTIVE',
    startTime: new Date().toISOString(),
  },
  bus: {
    id: 'BUS-102',
    number: 'KA-01-F-1234',
    plateNumber: 'KA-01-F-1234',
    capacity: 24,
    occupancy: 18,
    status: 'ON_ROUTE',
  },
  route: {
    id: 'R-04',
    name: 'Route 4 - North Campus Express',
    code: 'BTS-04',
    stops: ['Main Gate', 'Library Roundabout', 'Hostel Block A', 'Science Block Terminal'],
  },
};

/**
 * Canonical HTTP trip fetcher: Calls GET /drivers/me/trip.
 * Guarantees the driver only ever interacts with the assigned bus/route.
 */
export async function getDriverTripData(): Promise<DriverDashboardTripData | null> {
  try {
    const headers = await getAuthHeaders();

    const res = await fetch(`${API_URL}/drivers/me/trip`, {
      headers,
      next: { revalidate: 0 },
      cache: 'no-store',
    });

    if (!res.ok) {
      if (res.status === 404) {
        return process.env.NODE_ENV !== 'production' ? DEV_MOCK_DRIVER_TRIP : null;
      }
      throw new Error(`Failed to fetch driver trip: ${res.status}`);
    }

    const json = await res.json();
    const trip = json.data !== undefined ? json.data : json;

    if (!trip) return process.env.NODE_ENV !== 'production' ? DEV_MOCK_DRIVER_TRIP : null;

    return {
      trip: {
        id: trip.id,
        status: trip.status,
        startTime: trip.startTime ?? null,
        endTime: trip.endTime ?? null,
      },
      bus: {
        ...trip.bus,
        occupancy: trip.calculatedOccupancy ?? trip.bus?.occupancy ?? 0,
      },
      route: {
        ...trip.route,
        routeStops: trip.route?.routeStops || [],
        stops:
          trip.route?.routeStops?.map((rs: { stop?: { name: string } }) => rs.stop?.name || '') ||
          trip.route?.stops ||
          [],
      },
    };
  } catch (error) {
    console.error('API Error in getDriverTripData:', error);
    return null;
  }
}

/**
 * Driver Trip Mutation: Calls POST /trips/:id/start
 */
export async function startDriverTripAction(tripId: string) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/trips/${tripId}/start`, {
      method: 'POST',
      headers,
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        error: data?.error?.message || data?.message || 'Failed to start trip',
      };
    }

    revalidatePath('/driver/dashboard');
    return { success: true, data: data.data };
  } catch (err) {
    console.error('Error starting trip:', err);
    return { success: false, error: 'Network error starting trip' };
  }
}

/**
 * Driver Trip Mutation: Calls POST /trips/:id/end
 */
export async function endDriverTripAction(tripId: string) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/trips/${tripId}/end`, {
      method: 'POST',
      headers,
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        error: data?.error?.message || data?.message || 'Failed to end trip',
      };
    }

    revalidatePath('/driver/dashboard');
    return { success: true, data: data.data };
  } catch (err) {
    console.error('Error ending trip:', err);
    return { success: false, error: 'Network error ending trip' };
  }
}

/**
 * Driver Emergency SOS Mutation: Calls POST /trips/:id/sos
 */
export async function triggerDriverSosAction(tripId: string) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/trips/${tripId}/sos`, {
      method: 'POST',
      headers,
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        error: data?.error?.message || data?.message || 'Failed to trigger SOS alert',
      };
    }

    return { success: true, data: data.data };
  } catch (err) {
    console.error('Error triggering SOS:', err);
    return { success: false, error: 'Network error triggering SOS alert' };
  }
}
