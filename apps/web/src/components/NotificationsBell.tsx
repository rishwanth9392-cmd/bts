'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
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

export function NotificationsBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  // Compute unread count
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  // 1. Initial fetch
  useEffect(() => {
    let isMounted = true;
    async function loadNotifications() {
      setIsLoading(true);
      const res = await getNotificationsAction();
      if (isMounted && res.success) {
        setNotifications(res.data);
      }
      if (isMounted) {
        setIsLoading(false);
      }
    }
    loadNotifications();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Real-time sync via WebSocket
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
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
      });

      socketRef.current = socket;

      socket.on(NOTIFICATION_NEW, (newNotification: NotificationItem) => {
        if (!isMounted) return;
        setNotifications((prev) => {
          // Prevent duplicates
          if (prev.some((n) => n.id === newNotification.id)) return prev;
          return [newNotification, ...prev];
        });
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
  }, []);

  // 3. Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // 4. Mark single item as read
  const handleItemClick = useCallback(async (item: NotificationItem) => {
    if (item.readAt) return; // already read

    // Optimistic update
    const readTimestamp = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, readAt: readTimestamp } : n)),
    );

    await markNotificationReadAction(item.id);
  }, []);

  // 5. Mark all as read
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
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* Bell Trigger Button - Touch Target >= 48px */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
        aria-expanded={isOpen}
        className="relative flex h-12 w-12 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        <svg
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Red Unread Badge */}
        {unreadCount > 0 && (
          <span
            className="absolute top-1 right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white shadow-sm ring-2 ring-white animate-in zoom-in-50 duration-200"
            aria-hidden="true"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Notifications panel"
          className="absolute right-0 mt-2 w-84 sm:w-96 rounded-2xl border border-gray-200 bg-white shadow-2xl ring-1 ring-black ring-opacity-5 z-50 overflow-hidden transform transition-all animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/70 px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
              {unreadCount > 0 && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={isMarkingAll}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50 py-1.5 px-2 rounded hover:bg-blue-50 transition-colors"
              >
                {isMarkingAll ? 'Marking...' : 'Mark all as read'}
              </button>
            )}
          </div>

          {/* List Area */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-gray-100">
            {isLoading && notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <span className="text-3xl">📭</span>
                <p className="mt-2 text-sm font-medium text-gray-700">All caught up!</p>
                <p className="text-xs text-gray-400">No notifications to show right now.</p>
              </div>
            ) : (
              notifications.map((item) => {
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
                    className={`flex items-start gap-3 p-3.5 transition-colors cursor-pointer text-left select-none ${
                      isUnread
                        ? 'bg-blue-50/50 hover:bg-blue-50'
                        : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    {/* Type Badge Icon */}
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-base ${bg}`}
                      aria-hidden="true"
                    >
                      {icon}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p
                          className={`text-xs ${
                            isUnread ? 'font-bold text-gray-900' : 'font-medium text-gray-700'
                          } truncate`}
                        >
                          {item.title}
                        </p>
                        <span className="shrink-0 text-[10px] text-gray-400">
                          {formatTimeAgo(item.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-600 line-clamp-2 leading-relaxed">
                        {item.message}
                      </p>
                    </div>

                    {/* Unread indicator dot */}
                    {isUnread && (
                      <div
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600"
                        title="Unread"
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-2 text-center">
              <span className="text-[11px] text-gray-400">
                Showing recent {notifications.length} notifications
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
