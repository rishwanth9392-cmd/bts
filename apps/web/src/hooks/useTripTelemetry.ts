'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import {
  TRIP_LOCATION,
  TRIP_STARTED,
  TRIP_STOPPED,
  TRIP_COMPLETED,
  TRIP_SUBSCRIBE,
  TRIP_UNSUBSCRIBE,
  TRIP_OCCUPANCY,
  TRIP_PROGRESS,
} from '@bts/shared';
import type {
  TripLocationPayload,
  TripLifecyclePayload,
  TripOccupancyPayload,
  TripProgressPayload,
  DelayStatus,
} from '@bts/shared';
import {
  getLatestTripLocation,
  getTripProgressAction,
  getSessionToken,
} from '@/services/telemetry.service';

export interface TripProgressState {
  previousStopId: string | null;
  nextStopId: string | null;
  routeProgressPercentage: number;
  delayStatus: DelayStatus;
  deviation: boolean;
  status: 'AVAILABLE' | 'STALE' | 'UNAVAILABLE';
  nextStopEtaMinutes: number | null;
}

export interface TripTelemetryState {
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  recordedAt: string | null;
  freshness: 'ACTIVE' | 'STALE' | 'OFFLINE';
  isTripActive: boolean;
  isConnected: boolean;
  error: string | null;
  occupancy?: {
    occupiedSeats?: number;
    occupancyPercent?: number;
    occupancyStatus?: string;
    recentBoarding?: {
      stopId: string;
      stopName?: string;
    };
  } | null;
  progress: TripProgressState;
}

export function useTripTelemetry(tripId: string | null | undefined) {
  const [state, setState] = useState<TripTelemetryState>({
    latitude: null,
    longitude: null,
    speed: null,
    heading: null,
    accuracy: null,
    recordedAt: null,
    freshness: 'OFFLINE',
    isTripActive: true,
    isConnected: false,
    error: null,
    occupancy: null,
    progress: {
      previousStopId: null,
      nextStopId: null,
      routeProgressPercentage: 0,
      delayStatus: 'UNKNOWN',
      deviation: false,
      status: 'UNAVAILABLE',
      nextStopEtaMinutes: null,
    },
  });

  const socketRef = useRef<Socket | null>(null);

  const fetchLatest = useCallback(async () => {
    if (!tripId) return;
    try {
      const data = await getLatestTripLocation(tripId);
      if (data) {
        setState((prev) => ({
          ...prev,
          latitude: data.latitude ?? null,
          longitude: data.longitude ?? null,
          speed: data.speed ?? null,
          heading: data.heading ?? null,
          accuracy: data.accuracy ?? null,
          recordedAt: data.recordedAt ?? null,
          freshness: data.status || 'OFFLINE',
        }));
      }
    } catch (err) {
      console.error('Error fetching latest trip location:', err);
    }
  }, [tripId]);

  const fetchProgress = useCallback(async () => {
    if (!tripId) return;
    try {
      const data = await getTripProgressAction(tripId);
      if (data) {
        setState((prev) => ({
          ...prev,
          progress: {
            previousStopId: data.previousStopId ?? null,
            nextStopId: data.nextStopId ?? null,
            routeProgressPercentage: data.routeProgressPercentage ?? 0,
            delayStatus: data.delayStatus || 'UNKNOWN',
            deviation: Boolean(data.deviation),
            status: data.status || 'UNAVAILABLE',
            nextStopEtaMinutes: data.nextStopEtaMinutes ?? null,
          },
        }));
      }
    } catch (err) {
      console.error('Error fetching trip progress:', err);
    }
  }, [tripId]);

  useEffect(() => {
    if (!tripId) {
      setState((prev) => ({
        ...prev,
        latitude: null,
        longitude: null,
        freshness: 'OFFLINE',
        isConnected: false,
        progress: {
          previousStopId: null,
          nextStopId: null,
          routeProgressPercentage: 0,
          delayStatus: 'UNKNOWN',
          deviation: false,
          status: 'UNAVAILABLE',
          nextStopEtaMinutes: null,
        },
      }));
      return;
    }

    let isMounted = true;

    // 1. Initial HTTP fetches for immediate hydration
    fetchLatest();
    fetchProgress();

    // 2. Setup WebSocket connection
    async function setupSocket() {
      const token = await getSessionToken();
      if (!isMounted) return;

      const wsUrl =
        process.env.NEXT_PUBLIC_WS_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        'http://localhost:3001';

      const socket = io(wsUrl, {
        transports: ['websocket'],
        auth: { token: token ? `Bearer ${token}` : '' },
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        if (!isMounted) return;
        setState((prev) => ({ ...prev, isConnected: true, error: null }));
        // Subscribe to trip room
        socket.emit(TRIP_SUBSCRIBE, { tripId });
      });

      socket.on('disconnect', () => {
        if (!isMounted) return;
        setState((prev) => ({ ...prev, isConnected: false }));
      });

      // Reconnection logic: re-fetch latest location & route progress on reconnect
      socket.io.on('reconnect', () => {
        if (!isMounted) return;
        fetchLatest();
        fetchProgress();
        socket.emit(TRIP_SUBSCRIBE, { tripId });
      });

      // Listen for trip:location
      socket.on(TRIP_LOCATION, (payload: TripLocationPayload) => {
        if (!isMounted) return;
        if (payload.tripId === tripId) {
          setState((prev) => ({
            ...prev,
            latitude: payload.latitude,
            longitude: payload.longitude,
            speed: payload.speed,
            heading: payload.heading,
            accuracy: payload.accuracy,
            recordedAt: payload.recordedAt,
            freshness: (payload.status as 'ACTIVE' | 'STALE' | 'OFFLINE') || 'ACTIVE',
            isTripActive: true,
          }));
        }
      });

      // Listen for trip:started
      socket.on(TRIP_STARTED, (payload: TripLifecyclePayload) => {
        if (!isMounted) return;
        if (payload.tripId === tripId) {
          setState((prev) => ({
            ...prev,
            isTripActive: true,
            freshness: 'ACTIVE',
          }));
          fetchLatest();
          fetchProgress();
        }
      });

      // Listen for trip:stopped and trip:completed
      const handleTripStopped = (payload: TripLifecyclePayload) => {
        if (!isMounted) return;
        if (payload.tripId === tripId) {
          setState((prev) => ({
            ...prev,
            isTripActive: false,
            freshness: 'OFFLINE',
          }));
        }
      };

      socket.on(TRIP_STOPPED, handleTripStopped);
      socket.on(TRIP_COMPLETED, handleTripStopped);

      // Listen for trip:occupancy
      socket.on(TRIP_OCCUPANCY, (payload: TripOccupancyPayload) => {
        if (!isMounted) return;
        if (payload.tripId === tripId) {
          setState((prev) => ({
            ...prev,
            occupancy: {
              occupiedSeats: payload.occupiedSeats ?? payload.occupancyPercent ?? 0,
              occupancyPercent: payload.occupancyPercent,
              occupancyStatus: payload.occupancyStatus,
              recentBoarding: payload.recentBoarding
                ? {
                    stopId: payload.recentBoarding.stopId || '',
                    stopName: payload.recentBoarding.stopName,
                  }
                : undefined,
            },
          }));
        }
      });

      // Listen for trip:progress (Route progress, deviation, and schedule delay status)
      socket.on(TRIP_PROGRESS, (payload: TripProgressPayload) => {
        if (!isMounted) return;
        if (payload.tripId === tripId) {
          setState((prev) => ({
            ...prev,
            progress: {
              previousStopId: payload.previousStopId ?? null,
              nextStopId: payload.nextStopId ?? null,
              routeProgressPercentage: payload.routeProgressPercentage ?? 0,
              delayStatus: payload.delayStatus || 'UNKNOWN',
              deviation: Boolean(payload.deviation),
              status: payload.status || 'AVAILABLE',
              nextStopEtaMinutes: payload.nextStopEtaMinutes ?? null,
            },
          }));
        }
      });

      socket.on('connect_error', (err) => {
        if (!isMounted) return;
        setState((prev) => ({ ...prev, error: err.message, isConnected: false }));
      });
    }

    setupSocket();

    const handleWindowOnline = () => {
      fetchLatest();
      fetchProgress();
    };
    window.addEventListener('online', handleWindowOnline);

    return () => {
      isMounted = false;
      window.removeEventListener('online', handleWindowOnline);
      if (socketRef.current) {
        socketRef.current.emit(TRIP_UNSUBSCRIBE, { tripId });
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [tripId, fetchLatest, fetchProgress]);

  return {
    ...state,
    refetch: fetchLatest,
    refetchProgress: fetchProgress,
  };
}
