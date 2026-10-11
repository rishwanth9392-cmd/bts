'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface BoardingActionResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

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

/**
 * Server action to confirm student boarding for an active trip.
 * Securely derives user session and posts to backend check-in endpoint (APP method).
 *
 * @param tripId The active trip identifier
 */
export async function confirmBoarding(tripId: string): Promise<BoardingActionResponse> {
  try {
    const headers = await getAuthHeaders();

    const res = await fetch(`${API_URL}/boarding/check-in`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tripId }),
    });

    if (res.status === 201 || res.status === 200) {
      const json = await res.json().catch(() => ({}));
      revalidatePath('/student/dashboard');
      revalidatePath('/driver/dashboard');
      return { success: true, data: json.data || json };
    }

    if (res.status === 409) {
      return { success: false, error: 'Already Boarded' };
    }

    const errJson = await res.json().catch(() => ({}));
    const message =
      errJson.error?.message ||
      errJson.message ||
      'Unable to confirm boarding. Please check your trip assignment.';

    return { success: false, error: message };
  } catch (err) {
    if (isDynamicServerError(err)) throw err;
    console.error('confirmBoarding error:', err);
    return {
      success: false,
      error: 'Network error confirming boarding. Please check your connection.',
    };
  }
}

/**
 * Server action for student drop checkout ("I've Reached My Stop").
 */
export async function checkOutDrop(tripId: string): Promise<BoardingActionResponse> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/boarding/check-out`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tripId }),
    });

    const json = await res.json().catch(() => ({}));

    if (res.status === 201 || res.status === 200) {
      revalidatePath('/student/dashboard');
      revalidatePath('/driver/dashboard');
      return { success: true, data: json.data || json };
    }

    if (res.status === 409) {
      return { success: false, error: 'Already Checked Out' };
    }

    const message =
      json.error?.message || json.message || 'Failed to complete check out.';
    return { success: false, error: message };
  } catch (err) {
    if (isDynamicServerError(err)) throw err;
    console.error('checkOutDrop error:', err);
    return {
      success: false,
      error: 'Network error processing checkout. Please check your connection.',
    };
  }
}
