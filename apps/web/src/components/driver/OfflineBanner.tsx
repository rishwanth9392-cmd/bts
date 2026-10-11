'use client';

import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { getSessionToken } from '@/services/telemetry.service';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [isWsConnected, setIsWsConnected] = useState<boolean>(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    let isMounted = true;
    let socket: any = null;

    async function checkSocket() {
      const token = await getSessionToken();
      socket = io(SOCKET_URL, {
        auth: token ? { token } : undefined,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 20,
        reconnectionDelay: 1500,
      });

      socket.on('connect', () => {
        if (isMounted) setIsWsConnected(true);
      });

      socket.on('disconnect', () => {
        if (isMounted) setIsWsConnected(false);
      });

      socket.on('connect_error', () => {
        if (isMounted) setIsWsConnected(false);
      });

      socket.io.on('reconnect', () => {
        if (isMounted) setIsWsConnected(true);
      });
    }

    checkSocket();

    return () => {
      isMounted = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  const isDisconnected = !isOnline || !isWsConnected;

  if (!isDisconnected) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="sticky top-16 z-40 w-full bg-amber-500 text-amber-950 px-4 py-2.5 text-center text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md animate-pulse border-b border-amber-600"
    >
      <span className="text-base">⚠️</span>
      <span>Offline - Trying to reconnect...</span>
      <span className="inline-block h-2 w-2 rounded-full bg-amber-900 animate-ping ml-1" />
    </div>
  );
}
