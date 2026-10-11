'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { PickupAssignmentDetail, RouteDetail } from '@bts/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

export interface StudentProfile {
  id: string;
  email: string;
  role: string;
  student?: {
    id: string;
    usn: string;
    phone?: string | null;
  } | null;
}

function isDynamicServerError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'digest' in err &&
    (err as { digest: unknown }).digest === 'DYNAMIC_SERVER_USAGE'
  );
}

const DEV_MOCK_PROFILE: StudentProfile = {
  id: 'usr_student_demo',
  email: 'student@bmsit.edu',
  role: 'STUDENT',
  student: {
    id: 'stu_demo_01',
    usn: '1BM21CS001',
    phone: '9876543210',
  },
};

const DEV_MOCK_PICKUP: PickupAssignmentDetail = {
  id: 'pick_demo_01',
  studentId: 'stu_demo_01',
  routeId: 'R-04',
  stopId: 'stop_01',
  active: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  stop: {
    id: 'stop_01',
    name: 'Main Gate',
    lat: 12.9716,
    lng: 77.5946,
    radiusMeters: 50,
    sequence: 1,
  },
  route: {
    id: 'R-04',
    name: 'Route 4 - North Campus Express',
    code: 'BTS-04',
    description: 'North Campus via Main Gate & Science Block',
    routeStops: [
      { id: 'rs_1', routeId: 'R-04', stopId: 'stop_01', sequence: 1, stop: { id: 'stop_01', name: 'Main Gate', lat: 12.9716, lng: 77.5946, radiusMeters: 50 } },
      { id: 'rs_2', routeId: 'R-04', stopId: 'stop_02', sequence: 2, stop: { id: 'stop_02', name: 'Library Roundabout', lat: 12.9725, lng: 77.5955, radiusMeters: 50 } },
      { id: 'rs_3', routeId: 'R-04', stopId: 'stop_03', sequence: 3, stop: { id: 'stop_03', name: 'Hostel Block A', lat: 12.9735, lng: 77.5965, radiusMeters: 50 } },
      { id: 'rs_4', routeId: 'R-04', stopId: 'stop_04', sequence: 4, stop: { id: 'stop_04', name: 'Science Block Terminal', lat: 12.9745, lng: 77.5975, radiusMeters: 50 } },
    ],
  },
};

/**
 * Fetches the authenticated student's profile (name, USN, etc.)
 */
export async function getStudentProfile(): Promise<StudentProfile | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/auth/me`, {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) {
      return process.env.NODE_ENV !== 'production' ? DEV_MOCK_PROFILE : null;
    }
    const json = await res.json();
    return json.data ?? (process.env.NODE_ENV !== 'production' ? DEV_MOCK_PROFILE : null);
  } catch (error) {
    if (isDynamicServerError(error)) throw error;
    console.warn('getStudentProfile using dev fallback:', error);
    return process.env.NODE_ENV !== 'production' ? DEV_MOCK_PROFILE : null;
  }
}

/**
 * Fetches GET /students/me/pickup
 */
export async function getMyPickup(): Promise<PickupAssignmentDetail | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/students/me/pickup`, {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      return process.env.NODE_ENV !== 'production' ? DEV_MOCK_PICKUP : null;
    }

    const json = await res.json();
    return json.data ?? (process.env.NODE_ENV !== 'production' ? DEV_MOCK_PICKUP : null);
  } catch (error) {
    if (isDynamicServerError(error)) throw error;
    console.warn('getMyPickup using dev fallback:', error);
    return process.env.NODE_ENV !== 'production' ? DEV_MOCK_PICKUP : null;
  }
}

/**
 * Fetches GET /routes?q=...
 */
export async function getRoutes(query?: string): Promise<RouteDetail[]> {
  try {
    const headers = await getAuthHeaders();
    const url = new URL(`${API_URL}/routes`);
    if (query && query.trim()) {
      url.searchParams.set('q', query.trim());
    }

    const res = await fetch(url.toString(), {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch routes: ${res.statusText}`);
    }

    const json = await res.json();
    return json.data ?? [];
  } catch (error) {
    if (isDynamicServerError(error)) throw error;
    console.error('getRoutes Error:', error);
    return [];
  }
}

/**
 * Fetches GET /routes/:id
 */
export async function getRouteById(id: string): Promise<RouteDetail | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/routes/${id}`, {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Failed to fetch route ${id}: ${res.statusText}`);
    }

    const json = await res.json();
    return json.data ?? null;
  } catch (error) {
    if (isDynamicServerError(error)) throw error;
    console.error(`getRouteById Error (${id}):`, error);
    return null;
  }
}

export interface ActionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Sends PUT /students/me/pickup and revalidates relevant routes
 */
export async function setMyPickup(
  routeId: string,
  stopId: string,
): Promise<ActionResponse<PickupAssignmentDetail>> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/students/me/pickup`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ routeId, stopId }),
    });

    const json = await res.json();
    if (!res.ok || json.success === false) {
      return {
        success: false,
        error: json.error?.message || 'Failed to update pickup assignment',
      };
    }

    revalidatePath('/student/dashboard');
    revalidatePath('/student/routes');

    return {
      success: true,
      data: json.data,
    };
  } catch (error) {
    if (isDynamicServerError(error)) throw error;
    console.error('setMyPickup Error:', error);
    return {
      success: false,
      error: 'Could not connect to service. Please check your connection.',
    };
  }
}

/**
 * Sends DELETE /students/me/pickup and revalidates dashboard
 */
export async function removeMyPickup(): Promise<ActionResponse> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/students/me/pickup`, {
      method: 'DELETE',
      headers,
    });

    const json = await res.json();
    if (!res.ok || json.success === false) {
      return {
        success: false,
        error: json.error?.message || 'Failed to remove pickup assignment',
      };
    }

    revalidatePath('/student/dashboard');

    return {
      success: true,
    };
  } catch (error) {
    if (isDynamicServerError(error)) throw error;
    console.error('removeMyPickup Error:', error);
    return {
      success: false,
      error: 'Could not connect to service. Please check your connection.',
    };
  }
}
