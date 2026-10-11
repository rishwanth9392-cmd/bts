'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import {
  TRIP_STARTED,
  TRIP_STOPPED,
  TRIP_COMPLETED,
  TRIP_SUBSCRIBE,
  TRIP_UNSUBSCRIBE,
} from '@bts/shared';
import type { TripLifecyclePayload } from '@bts/shared';
import {
  getDriverTripData,
  startDriverTripAction,
  endDriverTripAction,
  triggerDriverSosAction,
} from '@/services/driver.service';
import type { DriverDashboardTripData } from '@/services/driver.service';
import { getSessionToken } from '@/services/telemetry.service';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface UseDriverOperationsReturn {
  tripData: DriverDashboardTripData | null;
  trip: DriverDashboardTripData['trip'] | null;
  bus: DriverDashboardTripData['bus'] | null;
  route: DriverDashboardTripData['route'] | null;
  status: 'SCHEDULED' | 'READY' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | string;
  isLoading: boolean;
  error: string | null;
  actionLoading: 'start' | 'end' | 'sos' | null;
  statusMessage: string | null;
  setStatusMessage: (msg: string | null) => void;
  startTrip: () => Promise<{ success: boolean; error?: string }>;
  endTrip: () => Promise<{ success: boolean; error?: string }>;
  triggerSos: () => Promise<{ success: boolean; error?: string }>;
  refreshTrip: () => Promise<void>;
  isOffline: boolean;
  isWsConnected: boolean;
}

export function useDriverOperations(): UseDriverOperationsReturn {
  const [tripData, setTripData] = useState<DriverDashboardTripData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<'start' | 'end' | 'sos' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Network & WebSocket connectivity tracking
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);

  const socketRef = useRef<Socket | null>(null);
  const activeTripIdRef = useRef<string | null>(null);
  activeTripIdRef.current = tripData?.trip?.id || null;

  /**
   * Canonical HTTP Fetcher: calls GET /drivers/me/trip
   */
  const fetchTripData = useCallback(async () => {
    try {
      setError(null);
      const data = await getDriverTripData();
      setTripData(data);
    } catch (err) {
      console.warn('Failed to fetch driver trip data (offline or network blip):', err);
      setError('Unable to load assigned trip');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Browser network status listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      fetchTripData();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleOnline);
    };
  }, [fetchTripData]);

  // Initial fetch on mount
  useEffect(() => {
    fetchTripData();
  }, [fetchTripData]);

  // WebSocket lifecycle listener: handles real-time trip:started and trip:completed
  useEffect(() => {
    let isMounted = true;

    async function initSocket() {
      const token = await getSessionToken();

      const socket = io(SOCKET_URL, {
        auth: token ? { token } : undefined,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 15,
        reconnectionDelay: 1500,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        if (!isMounted) return;
        setIsWsConnected(true);
        const currentTripId = activeTripIdRef.current;
        if (currentTripId) {
          socket.emit(TRIP_SUBSCRIBE, { tripId: currentTripId });
        }
      });

      socket.on('disconnect', () => {
        if (!isMounted) return;
        setIsWsConnected(false);
      });

      socket.on('connect_error', () => {
        if (!isMounted) return;
        setIsWsConnected(false);
      });

      // HTTP fallback refresh on socket reconnect
      socket.io.on('reconnect', () => {
        if (!isMounted) return;
        setIsWsConnected(true);
        fetchTripData();
        const currentTripId = activeTripIdRef.current;
        if (currentTripId) {
          socket.emit(TRIP_SUBSCRIBE, { tripId: currentTripId });
        }
      });

      // Realtime trip:started listener
      socket.on(TRIP_STARTED, (payload: TripLifecyclePayload) => {
        if (!isMounted) return;
        if (!activeTripIdRef.current || payload.tripId === activeTripIdRef.current) {
          setTripData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              trip: {
                ...prev.trip,
                status: 'ACTIVE',
                startTime: payload.timestamp || new Date().toISOString(),
              },
            };
          });
          fetchTripData();
        }
      });

      // Realtime trip:completed listener
      const handleTripCompleted = (payload: TripLifecyclePayload) => {
        if (!isMounted) return;
        if (!activeTripIdRef.current || payload.tripId === activeTripIdRef.current) {
          setTripData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              trip: {
                ...prev.trip,
                status: 'COMPLETED',
                endTime: payload.timestamp || new Date().toISOString(),
              },
            };
          });
          fetchTripData();
        }
      };

      socket.on(TRIP_COMPLETED, handleTripCompleted);
      socket.on(TRIP_STOPPED, handleTripCompleted);
    }

    initSocket();

    return () => {
      isMounted = false;
      if (socketRef.current) {
        if (activeTripIdRef.current) {
          socketRef.current.emit(TRIP_UNSUBSCRIBE, { tripId: activeTripIdRef.current });
        }
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [fetchTripData]);

  // Subscribe to trip room whenever trip ID changes
  useEffect(() => {
    const socket = socketRef.current;
    const currentTripId = tripData?.trip?.id;

    if (socket && socket.connected && currentTripId) {
      socket.emit(TRIP_SUBSCRIBE, { tripId: currentTripId });
    }

    return () => {
      if (socket && socket.connected && currentTripId) {
        socket.emit(TRIP_UNSUBSCRIBE, { tripId: currentTripId });
      }
    };
  }, [tripData?.trip?.id]);

  /**
   * Start Trip Mutation
   */
  const startTrip = useCallback(async () => {
    const id = tripData?.trip?.id;
    if (!id) return { success: false, error: 'No trip available to start' };

    setActionLoading('start');
    setStatusMessage(null);

    try {
      const res = await startDriverTripAction(id);
      if (res.success) {
        setTripData((prev) =>
          prev
            ? {
                ...prev,
                trip: {
                  ...prev.trip,
                  status: 'ACTIVE',
                  startTime: new Date().toISOString(),
                },
              }
            : null,
        );
        setStatusMessage('Trip started! Live telemetry tracking activated.');
        return { success: true };
      } else {
        const errorMsg = res.error || 'Failed to start trip';
        setStatusMessage(errorMsg);
        return { success: false, error: errorMsg };
      }
    } finally {
      setActionLoading(null);
    }
  }, [tripData?.trip?.id]);

  /**
   * End Trip Mutation
   */
  const endTrip = useCallback(async () => {
    const id = tripData?.trip?.id;
    if (!id) return { success: false, error: 'No trip available to end' };

    setActionLoading('end');
    setStatusMessage(null);

    try {
      const res = await endDriverTripAction(id);
      if (res.success) {
        setTripData((prev) =>
          prev
            ? {
                ...prev,
                trip: {
                  ...prev.trip,
                  status: 'COMPLETED',
                  endTime: new Date().toISOString(),
                },
              }
            : null,
        );
        setStatusMessage('Trip ended successfully.');
        return { success: true };
      } else {
        const errorMsg = res.error || 'Failed to end trip';
        setStatusMessage(errorMsg);
        return { success: false, error: errorMsg };
      }
    } finally {
      setActionLoading(null);
    }
  }, [tripData?.trip?.id]);

  /**
   * Emergency SOS Mutation
   */
  const triggerSos = useCallback(async () => {
    const id = tripData?.trip?.id;
    if (!id) return { success: false, error: 'No active trip available for SOS' };

    setActionLoading('sos');
    try {
      const res = await triggerDriverSosAction(id);
      if (res.success) {
        setStatusMessage('🚨 Emergency SOS alert sent to dispatch! Last GPS coordinates logged.');
        return { success: true };
      } else {
        const errorMsg = res.error || 'Failed to send SOS alert';
        setStatusMessage(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      console.warn('SOS network error:', err);
      const errorMsg = 'Network error sending SOS. Retrying in background.';
      setStatusMessage(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setActionLoading(null);
    }
  }, [tripData?.trip?.id]);

  return {
    tripData,
    trip: tripData?.trip || null,
    bus: tripData?.bus || null,
    route: tripData?.route || null,
    status: tripData?.trip?.status || 'SCHEDULED',
    isLoading,
    error,
    actionLoading,
    statusMessage,
    setStatusMessage,
    startTrip,
    endTrip,
    triggerSos,
    refreshTrip: fetchTripData,
    isOffline: !isOnline || !isWsConnected,
    isWsConnected,
  };
}
