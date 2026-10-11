'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import {
  TRIP_STARTED,
  TRIP_COMPLETED,
  ADMIN_SOS,
} from '@bts/shared';
import {
  getAdminFleetStatusAction,
  getAdminTripsAction,
  getAdminSosAlertsAction,
  cancelAdminTripAction,
  acknowledgeAdminSosAction,
} from '@/services/admin.service';
import { getSessionToken } from '@/services/telemetry.service';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface FleetStatusData {
  trips: {
    active: number;
    scheduled: number;
    ready: number;
    completed: number;
    cancelled: number;
    total: number;
  };
  telemetry: {
    active: number;
    stale: number;
    offline: number;
    totalActiveTrips: number;
  };
  fleet: {
    totalBuses: number;
    activeBuses: number;
    inactiveOrMaintenanceBuses: number;
  };
  safety: {
    unacknowledgedSosCount: number;
  };
  timestamp: string;
}

export interface AdminTripItem {
  id: string;
  status: 'SCHEDULED' | 'READY' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  startTime: string | null;
  endTime: string | null;
  createdAt: string;
  updatedAt: string;
  route: { id: string; name: string; description?: string };
  bus: { id: string; plateNumber: string; capacity: number; model?: string; status: string };
  driver: { id: string; name?: string; licenseNumber: string; phone?: string; email: string };
  telemetry: {
    latestLocation: { latitude: number; longitude: number; speed?: number; heading?: number; recordedAt: string } | null;
    freshnessSeconds: number | null;
    status: 'ACTIVE' | 'STALE' | 'OFFLINE' | 'N/A';
  };
  occupancy: {
    current: number;
    capacity: number;
    percentage: number;
  };
}

export interface AdminSosAlert {
  id: string;
  tripId: string;
  driverId: string;
  timestamp: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  isAcknowledged: boolean;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  isResolved: boolean;
  lastKnownGps: { latitude: number; longitude: number; speed?: number; heading?: number; recordedAt?: string } | null;
  route: { id: string; name: string } | null;
  bus: { id: string; plateNumber: string; model?: string } | null;
  driver: { id: string; name?: string; licenseNumber: string; phone?: string; email: string };
  metadata?: any;
}

export interface UseAdminFleetReturn {
  fleetStatus: FleetStatusData | null;
  trips: AdminTripItem[];
  sosAlerts: AdminSosAlert[];
  isLoading: boolean;
  error: string | null;
  isWsConnected: boolean;
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
  revalidate: () => Promise<void>;
  cancelTrip: (tripId: string, reason?: string) => Promise<{ success: boolean; error?: string }>;
  acknowledgeSos: (alertId: string) => Promise<{ success: boolean; error?: string }>;
}

export function useAdminFleet(): UseAdminFleetReturn {
  const [fleetStatus, setFleetStatus] = useState<FleetStatusData | null>(null);
  const [trips, setTrips] = useState<AdminTripItem[]>([]);
  const [sosAlerts, setSosAlerts] = useState<AdminSosAlert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);
  const [activeFilter, setActiveFilter] = useState<string>('ALL');

  const socketRef = useRef<Socket | null>(null);
  const isFetchingRef = useRef<boolean>(false);

  /**
   * Primary fetch and cache revalidation sequence
   */
  const revalidate = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const [statusRes, tripsRes, sosRes] = await Promise.all([
        getAdminFleetStatusAction(),
        getAdminTripsAction({
          status: activeFilter !== 'ALL' ? activeFilter : undefined,
          limit: 100,
        }),
        getAdminSosAlertsAction({ status: 'all', limit: 50 }),
      ]);

      if (statusRes) {
        setFleetStatus(statusRes);
      }

      if (tripsRes?.data) {
        setTrips(tripsRes.data);
      }

      if (sosRes?.data) {
        setSosAlerts(sosRes.data);
      }

      setError(null);
    } catch (err: any) {
      console.error('Failed to revalidate admin fleet data:', err);
      setError(err.message || 'Error communicating with fleet dispatch server');
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [activeFilter]);

  // Initial fetch and automatic refetch on filter change
  useEffect(() => {
    revalidate();
  }, [revalidate]);

  // Window Focus Automatic Refetch & Periodic 10s Heartbeat
  useEffect(() => {
    const handleFocus = () => {
      revalidate();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        revalidate();
      }
    });

    const interval = setInterval(() => {
      revalidate();
    }, 10000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [revalidate]);

  // Real-time WebSocket Synchronization
  useEffect(() => {
    let isMounted = true;

    async function initSocket() {
      const token = await getSessionToken();
      if (!isMounted) return;

      const socket = io(SOCKET_URL, {
        auth: { token: token ? `Bearer ${token}` : undefined },
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        if (!isMounted) return;
        setIsWsConnected(true);
        socket.emit('subscribe', { room: 'admin' });
      });

      socket.on('disconnect', () => {
        if (!isMounted) return;
        setIsWsConnected(false);
      });

      // Real-time event listeners
      const triggerImmediateUpdate = () => {
        revalidate();
      };

      socket.on(TRIP_STARTED, triggerImmediateUpdate);
      socket.on(TRIP_COMPLETED, triggerImmediateUpdate);
      socket.on('trip:cancelled', (payload: any) => {
        // Optimistically mark trip cancelled in local state
        if (payload?.tripId) {
          setTrips((prev) =>
            prev.map((t) =>
              t.id === payload.tripId ? { ...t, status: 'CANCELLED' } : t,
            ),
          );
        }
        revalidate();
      });

      socket.on(ADMIN_SOS, (_payload: any) => {
        // Optimistically increment unacknowledged count
        setFleetStatus((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            safety: {
              unacknowledgedSosCount: (prev.safety.unacknowledgedSosCount || 0) + 1,
            },
          };
        });
        revalidate();
      });
    }

    initSocket();

    return () => {
      isMounted = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [revalidate]);

  /**
   * Action: Cancel Trip
   */
  const cancelTrip = useCallback(
    async (tripId: string, reason?: string) => {
      // Optimistic update
      setTrips((prev) =>
        prev.map((t) =>
          t.id === tripId ? { ...t, status: 'CANCELLED' } : t,
        ),
      );

      const res = await cancelAdminTripAction(tripId, reason);
      if (!res.success) {
        // Rollback via server revalidate
        await revalidate();
        return { success: false, error: res.error };
      }

      await revalidate();
      return { success: true };
    },
    [revalidate],
  );

  /**
   * Action: Acknowledge SOS Alert
   */
  const acknowledgeSos = useCallback(
    async (alertId: string) => {
      // Optimistic update
      const now = new Date().toISOString();
      setSosAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId
            ? { ...a, isAcknowledged: true, acknowledgedAt: now }
            : a,
        ),
      );

      setFleetStatus((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          safety: {
            unacknowledgedSosCount: Math.max(0, (prev.safety.unacknowledgedSosCount || 1) - 1),
          },
        };
      });

      const res = await acknowledgeAdminSosAction(alertId);
      if (!res.success) {
        await revalidate();
        return { success: false, error: res.error };
      }

      await revalidate();
      return { success: true };
    },
    [revalidate],
  );

  return {
    fleetStatus,
    trips,
    sosAlerts,
    isLoading,
    error,
    isWsConnected,
    activeFilter,
    setActiveFilter,
    revalidate,
    cancelTrip,
    acknowledgeSos,
  };
}
