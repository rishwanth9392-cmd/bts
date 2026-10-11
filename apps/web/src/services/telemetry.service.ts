'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function isDynamicServerError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'digest' in err &&
    typeof (err as { digest: string }).digest === 'string' &&
    (err as { digest: string }).digest.startsWith('DYNAMIC_SERVER_USAGE')
  );
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

export async function getSessionToken(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get('bts_session_token')?.value || null;
  } catch (err) {
    if (isDynamicServerError(err)) throw err;
    return null;
  }
}

export async function getLatestTripLocation(tripId: string) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/trips/${tripId}/location/latest`, {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch (err) {
    if (isDynamicServerError(err)) throw err;
    return null;
  }
}

const DEV_MOCK_ACTIVE_TRIP = {
  id: 'trip_demo_101',
  routeId: 'R-04',
  busId: 'BUS-102',
  driverId: 'drv_01',
  status: 'IN_PROGRESS',
  calculatedOccupancy: 18,
  bus: {
    id: 'BUS-102',
    number: 'KA-01-F-1234',
    capacity: 24,
  },
};

export async function getActiveTripForRoute(routeId: string) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/trips/active`, {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) {
      return process.env.NODE_ENV !== 'production' ? DEV_MOCK_ACTIVE_TRIP : null;
    }
    const json = await res.json();
    const trips = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];
    const active = trips.find((t: any) => t.routeId === routeId);
    return active || (process.env.NODE_ENV !== 'production' ? DEV_MOCK_ACTIVE_TRIP : null);
  } catch (err) {
    if (isDynamicServerError(err)) throw err;
    console.warn('getActiveTripForRoute using dev fallback:', err);
    return process.env.NODE_ENV !== 'production' ? DEV_MOCK_ACTIVE_TRIP : null;
  }
}

export async function startTripAction(tripId: string) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/trips/${tripId}/start`, {
      method: 'POST',
      headers,
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data?.error?.message || data?.message || 'Failed to start trip' };
    }

    revalidatePath('/student/dashboard');
    revalidatePath('/driver/dashboard');
    return { success: true, data: data.data };
  } catch (err) {
    if (isDynamicServerError(err)) throw err;
    return { success: false, error: 'Network error starting trip' };
  }
}

export async function endTripAction(tripId: string) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/trips/${tripId}/end`, {
      method: 'POST',
      headers,
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data?.error?.message || data?.message || 'Failed to end trip' };
    }

    revalidatePath('/student/dashboard');
    revalidatePath('/driver/dashboard');
    return { success: true, data: data.data };
  } catch (err) {
    if (isDynamicServerError(err)) throw err;
    return { success: false, error: 'Network error ending trip' };
  }
}

export async function stopTripAction(tripId: string) {
  return endTripAction(tripId);
}

export async function sendLocationAction(
  tripId: string,
  payload: {
    latitude: number;
    longitude: number;
    speed?: number;
    heading?: number;
    accuracy?: number;
    recordedAt: string;
  },
) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/trips/${tripId}/location`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data?.error?.message || data?.message || 'Failed to send location' };
    }

    return { success: true, data: data.data };
  } catch (err) {
    if (isDynamicServerError(err)) throw err;
    return { success: false, error: 'Network error sending location' };
  }
}

export async function getDriverActiveTrip() {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/trips/active`, {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) return null;
    const json = await res.json();
    const trips = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];
    return trips[0] || null;
  } catch (err) {
    if (isDynamicServerError(err)) throw err;
    return null;
  }
}

export async function getTripProgressAction(tripId: string) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/trips/${tripId}/progress`, {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) return null;
    const json = await res.json();
    return json.data !== undefined ? json.data : json;
  } catch (err) {
    if (isDynamicServerError(err)) throw err;
    return null;
  }
}

export async function getStudentEtaAction() {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/students/me/eta`, {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) return null;
    const json = await res.json();
    return json.data !== undefined ? json.data : json;
  } catch (err) {
    if (isDynamicServerError(err)) throw err;
    return null;
  }
}

