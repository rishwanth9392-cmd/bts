'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Button } from '@bts/ui';
import { io } from 'socket.io-client';
import { NOTIFICATION_NEW } from '@bts/shared';
import { getSessionToken } from '@/services/telemetry.service';
import {
  getNotificationsAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
  type NotificationItem,
} from '@/services/notifications.service';

function formatTimeAgo(dateStr: string | Date): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case 'BUS_NEAR_PICKUP':
      return { icon: '📍', bg: 'bg-amber-100 text-amber-800 border-amber-200' };
    case 'BOARDING_CONFIRMED':
      return { icon: '🎟️', bg: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    case 'TRIP_STARTED':
      return { icon: '🚌', bg: 'bg-blue-100 text-blue-800 border-blue-200' };
    case 'TRIP_STOPPED':
      return { icon: '🏁', bg: 'bg-slate-100 text-slate-800 border-slate-200' };
    default:
      return { icon: '🔔', bg: 'bg-purple-100 text-purple-800 border-purple-200' };
  }
}

export default function StudentNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setIsLoading(true);
      const res = await getNotificationsAction();
      if (isMounted && res.success) {
        setNotifications(res.data);
      }
      if (isMounted) setIsLoading(false);
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
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
      });

      socket.on(NOTIFICATION_NEW, (newNotification: NotificationItem) => {
        if (!isMounted) return;
        setNotifications((prev) => {
          if (prev.some((n) => n.id === newNotification.id)) return prev;
          return [newNotification, ...prev];
        });
      });

      return () => {
        socket.disconnect();
      };
    }

    const cleanupPromise = initSocket();
    return () => {
      isMounted = false;
      cleanupPromise.then((cleanup) => cleanup && cleanup());
    };
  }, []);

  const handleItemClick = useCallback(async (item: NotificationItem) => {
    if (item.readAt) return;
    const readTimestamp = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, readAt: readTimestamp } : n)),
    );
    await markNotificationReadAction(item.id);
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    if (unreadCount === 0 || isMarkingAll) return;
    setIsMarkingAll(true);
    const readTimestamp = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt || readTimestamp })),
    );
    try {
      await markAllNotificationsReadAction();
    } finally {
      setIsMarkingAll(false);
    }
  }, [unreadCount, isMarkingAll]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications & Alerts</h1>
          <p className="text-sm text-gray-500">Real-time trip, arrival, and boarding updates</p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={isMarkingAll}
            className="min-h-[44px]"
          >
            {isMarkingAll ? 'Marking...' : 'Mark all as read'}
          </Button>
        )}
      </div>

      {isLoading ? (
        <Card className="p-8 text-center text-sm text-gray-500">Loading your notifications...</Card>
      ) : notifications.length === 0 ? (
        <Card className="p-12 text-center">
          <span className="text-4xl">📭</span>
          <h2 className="mt-3 text-base font-semibold text-gray-800">No Notifications</h2>
          <p className="mt-1 text-sm text-gray-500">
            You will receive updates when your bus is approaching or when you board.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => {
            const isUnread = !item.readAt;
            const { icon, bg } = getTypeIcon(item.type);

            return (
              <div
                key={item.id}
                onClick={() => handleItemClick(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleItemClick(item);
                  }
                }}
                className={`flex items-start gap-4 rounded-xl border p-4 transition-shadow cursor-pointer ${
                  isUnread
                    ? 'border-blue-200 bg-blue-50/40 shadow-sm hover:shadow'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-lg ${bg}`}
                >
                  {icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      className={`text-sm ${
                        isUnread ? 'font-bold text-gray-900' : 'font-medium text-gray-800'
                      }`}
                    >
                      {item.title}
                    </h3>
                    <span className="shrink-0 text-xs text-gray-400">
                      {formatTimeAgo(item.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600 leading-relaxed">{item.message}</p>
                </div>
                {isUnread && (
                  <div className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
