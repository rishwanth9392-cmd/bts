'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import {
  USER_SUBSCRIBE,
  USER_UNSUBSCRIBE,
  PICKUP_ARRIVED,
  STUDENT_ETA,
} from '@bts/shared';
import type { PickupArrivedPayload, StudentEtaPayload } from '@bts/shared';
import { getSessionToken, getStudentEtaAction } from '@/services/telemetry.service';

export interface StudentEtaState {
  etaMinutes: number | null;
  state: 'AVAILABLE' | 'CALCULATING' | 'STALE' | 'UNAVAILABLE' | 'PASSED';
  stopId?: string | null;
  stopName?: string | null;
  distanceMeters?: number | null;
}

export function useStudentEvents(studentUserId?: string | null) {
  const [arrivalPrompt, setArrivalPrompt] = useState<PickupArrivedPayload | null>(null);
  const [etaState, setEtaState] = useState<StudentEtaState>({
    etaMinutes: null,
    state: 'CALCULATING',
    stopId: null,
    stopName: null,
    distanceMeters: null,
  });
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const dismissPrompt = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setArrivalPrompt(null);
  }, []);

  const fetchEtaFallback = useCallback(async () => {
    try {
      const data = await getStudentEtaAction();
      if (data) {
        setEtaState({
          etaMinutes: data.etaMinutes !== undefined ? data.etaMinutes : null,
          state: data.status || 'UNAVAILABLE',
          stopId: data.stopId || null,
          stopName: data.stopName || null,
          distanceMeters: data.distanceMeters !== undefined ? data.distanceMeters : null,
        });
      }
    } catch {
      // Fallback network error gracefully suppressed
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    // 1. Initial HTTP fallback fetch for immediate hydration
    fetchEtaFallback();

    async function initSocket() {
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
        setIsConnected(true);
        // Subscribe to private user room
        socket.emit(USER_SUBSCRIBE, { userId: studentUserId });
      });

      socket.on('disconnect', () => {
        if (!isMounted) return;
        setIsConnected(false);
      });

      // Handle re-subscription and state refresh upon reconnection
      socket.io.on('reconnect', () => {
        if (!isMounted) return;
        fetchEtaFallback();
        socket.emit(USER_SUBSCRIBE, { userId: studentUserId });
      });

      // Listen for targeted pickup:arrived events
      socket.on(PICKUP_ARRIVED, (payload: PickupArrivedPayload) => {
        if (!isMounted) return;
        setArrivalPrompt(payload);

        // 5-minute expiration: automatically clear prompt if user ignores it
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => {
          if (isMounted) {
            setArrivalPrompt(null);
          }
        }, 5 * 60 * 1000);
      });

      // Listen for targeted private student:eta events
      socket.on(STUDENT_ETA, (payload: StudentEtaPayload) => {
        if (!isMounted) return;
        setEtaState({
          etaMinutes: payload.etaMinutes,
          state: payload.state,
          stopId: payload.stopId || null,
          stopName: payload.stopName || null,
          distanceMeters: payload.distanceMeters !== undefined ? payload.distanceMeters : null,
        });
      });
    }

    initSocket();

    return () => {
      isMounted = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.emit(USER_UNSUBSCRIBE, { userId: studentUserId });
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [studentUserId, fetchEtaFallback]);

  return {
    arrivalPrompt,
    dismissPrompt,
    isConnected,
    eta: etaState,
    etaState,
    refetchEta: fetchEtaFallback,
  };
}
