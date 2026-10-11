'use server';

import { cookies } from 'next/headers';

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

const DEV_MOCK_FLEET_STATUS = {
  data: {
    trips: { active: 4, scheduled: 2, ready: 1, completed: 8, cancelled: 0, total: 15 },
    telemetry: { active: 4, stale: 0, offline: 0, totalActiveTrips: 4 },
    fleet: { totalBuses: 6, activeBuses: 4, inactiveOrMaintenanceBuses: 2 },
    safety: { unacknowledgedSosCount: 0 },
    timestamp: new Date().toISOString(),
  },
};

const DEV_MOCK_ADMIN_TRIPS = {
  data: [
    {
      id: 'trip_demo_101',
      status: 'ACTIVE',
      startTime: new Date().toISOString(),
      endTime: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      route: { id: 'R-04', name: 'BTS-04: North Campus Express', description: 'Main Gate to Science Block' },
      bus: { id: 'BUS-102', plateNumber: 'KA-01-F-1234', capacity: 24, model: 'Tata Starbus', status: 'ON_ROUTE' },
      driver: { id: 'drv_01', name: 'Ramesh Kumar', licenseNumber: 'KA0120180004921', phone: '9876543210', email: 'ramesh.k@bmsit.edu' },
      telemetry: {
        latestLocation: { latitude: 12.9716, longitude: 77.5946, speed: 32, heading: 90, recordedAt: new Date().toISOString() },
        freshnessSeconds: 2,
        status: 'ACTIVE',
      },
      occupancy: { current: 18, capacity: 24, percentage: 75 },
    },
    {
      id: 'trip_demo_102',
      status: 'ACTIVE',
      startTime: new Date().toISOString(),
      endTime: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      route: { id: 'R-05', name: 'BTS-05: South Metro Feeder', description: 'Yelahanka Metro Station Link' },
      bus: { id: 'BUS-103', plateNumber: 'KA-01-F-1235', capacity: 40, model: 'Ashok Leyland', status: 'ON_ROUTE' },
      driver: { id: 'drv_02', name: 'Suresh Patil', licenseNumber: 'KA0120190005112', phone: '9876543211', email: 'suresh.p@bmsit.edu' },
      telemetry: {
        latestLocation: { latitude: 12.9720, longitude: 77.5950, speed: 28, heading: 45, recordedAt: new Date().toISOString() },
        freshnessSeconds: 5,
        status: 'ACTIVE',
      },
      occupancy: { current: 40, capacity: 40, percentage: 100 },
    },
    {
      id: 'trip_demo_103',
      status: 'READY',
      startTime: null,
      endTime: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      route: { id: 'R-01', name: 'BTS-01: City Central Connect', description: 'Majestic Bus Stand Direct' },
      bus: { id: 'BUS-107', plateNumber: 'KA-01-F-1239', capacity: 40, model: 'Tata Starbus Ultra', status: 'READY' },
      driver: { id: 'drv_03', name: 'Manjunath Gowda', licenseNumber: 'KA0120170003881', phone: '9876543212', email: 'manjunath.g@bmsit.edu' },
      telemetry: { latestLocation: null, freshnessSeconds: null, status: 'N/A' },
      occupancy: { current: 0, capacity: 40, percentage: 0 },
    },
  ],
  total: 3,
  page: 1,
  limit: 50,
};

export async function getAdminFleetStatusAction() {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/admin/fleet/status`, {
      headers,
      cache: 'no-store',
    });
    if (!res.ok) {
      return process.env.NODE_ENV !== 'production' ? DEV_MOCK_FLEET_STATUS : null;
    }
    return await res.json();
  } catch (err: any) {
    console.warn('getAdminFleetStatusAction using dev fallback:', err);
    return process.env.NODE_ENV !== 'production' ? DEV_MOCK_FLEET_STATUS : null;
  }
}

export async function getAdminTripsAction(params?: {
  status?: string;
  routeId?: string;
  busId?: string;
  driverId?: string;
  page?: number;
  limit?: number;
}) {
  try {
    const headers = await getAuthHeaders();
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.routeId) query.set('routeId', params.routeId);
    if (params?.busId) query.set('busId', params.busId);
    if (params?.driverId) query.set('driverId', params.driverId);
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());

    const queryString = query.toString();
    const url = `${API_URL}/admin/trips${queryString ? `?${queryString}` : ''}`;

    const res = await fetch(url, {
      headers,
      cache: 'no-store',
    });
    if (!res.ok) {
      return process.env.NODE_ENV !== 'production' ? DEV_MOCK_ADMIN_TRIPS : { data: [], total: 0, page: 1, limit: 50 };
    }
    return await res.json();
  } catch (err: any) {
    console.warn('getAdminTripsAction using dev fallback:', err);
    return process.env.NODE_ENV !== 'production' ? DEV_MOCK_ADMIN_TRIPS : { data: [], total: 0, page: 1, limit: 50 };
  }
}

export async function getAdminSosAlertsAction(params?: {
  status?: 'all' | 'unacknowledged' | 'unresolved';
  page?: number;
  limit?: number;
}) {
  try {
    const headers = await getAuthHeaders();
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());

    const queryString = query.toString();
    const url = `${API_URL}/admin/sos${queryString ? `?${queryString}` : ''}`;

    const res = await fetch(url, {
      headers,
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch SOS alerts (${res.status})`);
    }
    return await res.json();
  } catch (err: any) {
    console.error('Error in getAdminSosAlertsAction:', err);
    return { data: [], total: 0, page: 1, limit: 50 };
  }
}

export async function cancelAdminTripAction(tripId: string, reason?: string) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/admin/trips/${tripId}/cancel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason }),
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        error: data.message || `Failed to cancel trip (${res.status})`,
      };
    }
    return { success: true, data };
  } catch (err: any) {
    console.error('Error in cancelAdminTripAction:', err);
    return { success: false, error: err.message || 'Network error while cancelling trip' };
  }
}

export async function acknowledgeAdminSosAction(sosId: string) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/admin/sos/${sosId}/acknowledge`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        error: data.message || `Failed to acknowledge SOS (${res.status})`,
      };
    }
    return { success: true, data };
  } catch (err: any) {
    console.error('Error in acknowledgeAdminSosAction:', err);
    return { success: false, error: err.message || 'Network error while acknowledging SOS' };
  }
}

export async function resolveAdminSosAction(sosId: string, resolutionNotes: string) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/admin/sos/${sosId}/resolve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ resolutionNotes }),
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        error: data.message || `Failed to resolve SOS (${res.status})`,
      };
    }
    return { success: true, data };
  } catch (err: any) {
    console.error('Error in resolveAdminSosAction:', err);
    return { success: false, error: err.message || 'Network error while resolving SOS' };
  }
}

export async function getAdminBusesAction(params?: {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  try {
    const headers = await getAuthHeaders();
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());

    const queryString = query.toString();
    const url = `${API_URL}/admin/buses${queryString ? `?${queryString}` : ''}`;

    const res = await fetch(url, {
      headers,
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch buses (${res.status})`);
    }
    return await res.json();
  } catch (err: any) {
    console.error('Error in getAdminBusesAction:', err);
    return { data: [], total: 0, page: 1, limit: 50 };
  }
}

export async function createAdminBusAction(data: {
  plateNumber: string;
  capacity: number;
  model?: string;
  status?: string;
}) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/admin/buses`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      return { success: false, error: json.message || `Failed to create bus (${res.status})` };
    }
    return { success: true, data: json };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error creating bus' };
  }
}

export async function updateAdminBusAction(
  busId: string,
  data: {
    plateNumber?: string;
    capacity?: number;
    model?: string;
    status?: string;
    isActive?: boolean;
  },
) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/admin/buses/${busId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      return { success: false, error: json.message || `Failed to update bus (${res.status})` };
    }
    return { success: true, data: json };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error updating bus' };
  }
}

export async function toggleAdminBusActiveAction(busId: string, isActive: boolean) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/admin/buses/${busId}/active`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ isActive }),
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        success: false,
        error: json.message || `Failed to toggle bus active state (${res.status})`,
      };
    }
    return { success: true, data: json };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error updating bus' };
  }
}

export async function getAdminDriversAction(params?: {
  search?: string;
  page?: number;
  limit?: number;
}) {
  try {
    const headers = await getAuthHeaders();
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());

    const queryString = query.toString();
    const url = `${API_URL}/admin/drivers${queryString ? `?${queryString}` : ''}`;

    const res = await fetch(url, {
      headers,
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch drivers (${res.status})`);
    }
    return await res.json();
  } catch (err: any) {
    console.error('Error in getAdminDriversAction:', err);
    return { data: [], total: 0, page: 1, limit: 50 };
  }
}

export async function createAdminDriverAction(data: {
  email: string;
  name?: string;
  licenseNumber: string;
  phone?: string;
  password?: string;
}) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/admin/drivers`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      return { success: false, error: json.message || `Failed to create driver (${res.status})` };
    }
    return { success: true, data: json };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error creating driver' };
  }
}

export async function updateAdminDriverAction(
  driverId: string,
  data: {
    name?: string;
    licenseNumber?: string;
    phone?: string;
    isActive?: boolean;
  },
) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/admin/drivers/${driverId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      return { success: false, error: json.message || `Failed to update driver (${res.status})` };
    }
    return { success: true, data: json };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error updating driver' };
  }
}

export async function toggleAdminDriverActiveAction(driverId: string, isActive: boolean) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/admin/drivers/${driverId}/active`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ isActive }),
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        success: false,
        error: json.message || `Failed to toggle driver active state (${res.status})`,
      };
    }
    return { success: true, data: json };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error updating driver' };
  }
}

export async function assignAdminTripAction(data: {
  routeId: string;
  busId: string;
  driverId: string;
  startTime?: string;
}) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/admin/trips/assign`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        success: false,
        statusCode: res.status,
        error: json.message || `Failed to assign trip (${res.status})`,
      };
    }
    return { success: true, data: json };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error assigning trip' };
  }
}

export async function getAdminRoutesAction() {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/routes`, {
      headers,
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch routes (${res.status})`);
    }
    return await res.json();
  } catch (err: any) {
    console.error('Error in getAdminRoutesAction:', err);
    return [];
  }
}

export async function getAdminMaintenanceAction(params?: {
  busId?: string;
  status?: string;
  category?: string;
  page?: number;
  limit?: number;
}) {
  try {
    const headers = await getAuthHeaders();
    const query = new URLSearchParams();
    if (params?.busId) query.set('busId', params.busId);
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.category && params.category !== 'ALL') query.set('category', params.category);
    if (params?.page) query.set('page', params.page.toString());
    if (params?.limit) query.set('limit', params.limit.toString());

    const queryString = query.toString();
    const url = `${API_URL}/admin/maintenance${queryString ? `?${queryString}` : ''}`;

    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Failed to fetch maintenance tickets (${res.status})`);
    }
    return await res.json();
  } catch (err: any) {
    console.error('Error in getAdminMaintenanceAction:', err);
    return { data: [], total: 0, page: 1, limit: 50 };
  }
}

export async function createAdminMaintenanceAction(data: {
  busId: string;
  category: string;
  description: string;
  notes?: string;
}) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/admin/maintenance`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        success: false,
        error: json.message || `Failed to create maintenance ticket (${res.status})`,
      };
    }
    return { success: true, data: json };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error creating maintenance ticket' };
  }
}

export async function updateAdminMaintenanceAction(
  ticketId: string,
  data: {
    status?: string;
    notes?: string;
    resolvedAt?: string;
  },
) {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/admin/maintenance/${ticketId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        success: false,
        error: json.message || `Failed to update maintenance ticket (${res.status})`,
      };
    }
    return { success: true, data: json };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error updating maintenance ticket' };
  }
}

export async function getAdminAuditLogsAction(params?: {
  targetType?: string;
  targetId?: string;
  adminId?: string;
  limit?: number;
  offset?: number;
}) {
  try {
    const headers = await getAuthHeaders();
    const query = new URLSearchParams();
    if (params?.targetType && params.targetType !== 'ALL') query.set('targetType', params.targetType);
    if (params?.targetId) query.set('targetId', params.targetId);
    if (params?.adminId) query.set('adminId', params.adminId);
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.offset !== undefined) query.set('offset', params.offset.toString());

    const queryString = query.toString();
    const url = `${API_URL}/admin/audit-logs${queryString ? `?${queryString}` : ''}`;

    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Failed to fetch audit logs (${res.status})`);
    }
    return await res.json();
  } catch (err: any) {
    console.error('Error in getAdminAuditLogsAction:', err);
    return { data: [], total: 0, limit: 50, offset: 0 };
  }
}
