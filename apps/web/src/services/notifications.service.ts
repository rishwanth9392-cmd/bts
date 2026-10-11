'use server';

import { cookies } from 'next/headers';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function isDynamicServerError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'digest' in err &&
    typeof (err as { digest: string }).digest === 'string' &&
    (err as { digest: string }).digest.startsWith('DYNAMIC_SERVER_USAGE')
  );
}

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

export interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

/**
 * Fetch latest 50 notifications for the authenticated user.
 */
export async function getNotificationsAction(): Promise<{
  success: boolean;
  data: NotificationItem[];
  error?: string;
}> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/notifications`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });

    const json = await res.json().catch(() => ({}));

    if (res.ok) {
      const list = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];
      return { success: true, data: list };
    }

    return {
      success: false,
      data: [],
      error: json.error?.message || json.message || 'Failed to fetch notifications',
    };
  } catch (err) {
    if (isDynamicServerError(err)) throw err;
    console.error('getNotificationsAction error:', err);
    return { success: false, data: [], error: 'Network error fetching notifications' };
  }
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationReadAction(id: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/notifications/${id}/read`, {
      method: 'PATCH',
      headers,
    });

    if (res.ok) {
      return { success: true };
    }

    const json = await res.json().catch(() => ({}));
    return {
      success: false,
      error: json.error?.message || json.message || 'Failed to mark notification as read',
    };
  } catch (err) {
    if (isDynamicServerError(err)) throw err;
    console.error('markNotificationReadAction error:', err);
    return { success: false, error: 'Network error updating notification' };
  }
}

/**
 * Mark all notifications as read for current user.
 */
export async function markAllNotificationsReadAction(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/notifications/read-all`, {
      method: 'PATCH',
      headers,
    });

    if (res.ok) {
      return { success: true };
    }

    const json = await res.json().catch(() => ({}));
    return {
      success: false,
      error: json.error?.message || json.message || 'Failed to mark all as read',
    };
  } catch (err) {
    if (isDynamicServerError(err)) throw err;
    console.error('markAllNotificationsReadAction error:', err);
    return { success: false, error: 'Network error updating notifications' };
  }
}
