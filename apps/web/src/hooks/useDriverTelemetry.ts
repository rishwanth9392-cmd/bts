'use client';

import { useState, useEffect, useRef } from 'react';
import { sendLocationAction } from '@/services/telemetry.service';

export interface DriverTelemetryLocation {
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  recordedAt: string;
}

export interface UseDriverTelemetryOptions {
  /** Upload throttle interval in milliseconds (default: 4000ms) */
  throttleMs?: number;
  /** High accuracy GPS mode (default: true) */
  enableHighAccuracy?: boolean;
}

export interface UseDriverTelemetryReturn {
  isStreaming: boolean;
  lastLocation: DriverTelemetryLocation | null;
  error: string | null;
  gpsSignal: 'LIVE' | 'STALE' | 'OFFLINE' | 'DENIED';
}

/**
 * Driver Telemetry Hook with strict ACTIVE Status Guard and Offline Resiliency.
 *
 * ACTIVE Guard: navigator.geolocation upload is strictly enabled ONLY when trip.status === 'ACTIVE'.
 * If the trip is READY, SCHEDULED, or COMPLETED, GPS broadcasting terminates immediately
 * to conserve battery and eliminate spurious background telemetry.
 *
 * Cellular Dead Zone Guard:
 * When offline, GPS uploads are gracefully paused with zero unhandled promise rejections.
 */
export function useDriverTelemetry(
  tripId: string | null | undefined,
  tripStatus: string | null | undefined,
  options: UseDriverTelemetryOptions = {},
): UseDriverTelemetryReturn {
  const { throttleMs = 4000, enableHighAccuracy = true } = options;

  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [lastLocation, setLastLocation] = useState<DriverTelemetryLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gpsSignal, setGpsSignal] = useState<'LIVE' | 'STALE' | 'OFFLINE' | 'DENIED'>('OFFLINE');

  const tripIdRef = useRef<string | null | undefined>(tripId);
  tripIdRef.current = tripId;

  const tripStatusRef = useRef<string | null | undefined>(tripStatus);
  tripStatusRef.current = tripStatus;

  const lastUploadTimeRef = useRef<number>(0);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    // ── ACTIVE GUARD ──────────────────────────────────────────────────────────
    // If trip is NOT actively in progress, ensure GPS broadcasting is stopped.
    const isTripActive = tripStatus === 'ACTIVE' && Boolean(tripId);

    if (!isTripActive) {
      if (watchIdRef.current !== null && typeof window !== 'undefined' && 'navigator' in window) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsStreaming(false);
      setGpsSignal('OFFLINE');
      return;
    }

    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setError('Geolocation is not supported on this device');
      setGpsSignal('OFFLINE');
      return;
    }

    setIsStreaming(true);
    setGpsSignal(typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : 'LIVE');

    const handleSuccess = async (position: GeolocationPosition) => {
      // Re-verify ACTIVE guard before uploading
      if (tripStatusRef.current !== 'ACTIVE' || !tripIdRef.current) {
        return;
      }

      // ── CELLULAR DEAD ZONE GUARD ────────────────────────────────────────────
      // Pause uploading when device is in a network dead zone
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setGpsSignal('OFFLINE');
        return;
      }

      const now = Date.now();
      if (now - lastUploadTimeRef.current < throttleMs) {
        return;
      }
      lastUploadTimeRef.current = now;

      const { latitude, longitude, speed, heading, accuracy } = position.coords;
      const speedKmh = speed !== null && speed !== undefined ? Math.max(0, speed * 3.6) : undefined;

      const payload = {
        latitude,
        longitude,
        speed: speedKmh,
        heading: heading !== null && heading !== undefined ? heading : undefined,
        accuracy: accuracy !== null && accuracy !== undefined ? accuracy : undefined,
        recordedAt: new Date().toISOString(),
      };

      setLastLocation(payload);
      setError(null);
      setGpsSignal(accuracy && accuracy > 20 ? 'STALE' : 'LIVE');

      try {
        const activeId = tripIdRef.current;
        if (activeId && tripStatusRef.current === 'ACTIVE') {
          // Send location defensively without allowing unhandled promise rejections
          const res = await sendLocationAction(activeId, payload);
          if (res && !res.success) {
            // Soft failure (e.g. momentary connectivity dip)
            setGpsSignal('STALE');
          }
        }
      } catch (uploadErr) {
        // Suppress unhandled network rejections during cellular dropouts
        setGpsSignal('STALE');
      }
    };

    const handleError = (geoErr: GeolocationPositionError) => {
      if (geoErr.code === geoErr.PERMISSION_DENIED) {
        setError('Location permission denied. Please allow GPS access.');
        setGpsSignal('DENIED');
      } else if (geoErr.code === geoErr.TIMEOUT) {
        setError('Location request timed out.');
        setGpsSignal('STALE');
      } else {
        setError('Unable to acquire GPS fix.');
        setGpsSignal('STALE');
      }
    };

    const watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy,
      timeout: 15000,
      maximumAge: 3000,
    });

    watchIdRef.current = watchId;

    const handleNetworkOffline = () => setGpsSignal('OFFLINE');
    const handleNetworkOnline = () => setGpsSignal('LIVE');

    window.addEventListener('offline', handleNetworkOffline);
    window.addEventListener('online', handleNetworkOnline);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      window.removeEventListener('offline', handleNetworkOffline);
      window.removeEventListener('online', handleNetworkOnline);
      setIsStreaming(false);
    };
  }, [tripId, tripStatus, throttleMs, enableHighAccuracy]);

  return {
    isStreaming,
    lastLocation,
    error,
    gpsSignal,
  };
}
