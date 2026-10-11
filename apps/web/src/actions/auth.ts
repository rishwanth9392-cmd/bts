'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT } from 'jose';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_change_in_prod';

async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set('bts_session_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  });
}

async function createDevToken(payload: { role: string; email?: string; usn?: string; mobile?: string }) {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return new SignJWT({
    sub: payload.email || payload.usn || payload.mobile || 'demo-user',
    role: payload.role.toUpperCase(),
    email: payload.email,
    usn: payload.usn,
    mobile: payload.mobile,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret);
}

export async function loginAdminAction(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Please enter both email and password' };
  }

  let token: string | null = null;
  try {
    const res = await fetch(`${API_URL}/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      token = data.data?.accessToken;
    }
  } catch (err) {
    console.warn('API unreachable, using dev fallback token:', err);
  }

  if (!token && process.env.NODE_ENV !== 'production') {
    token = await createDevToken({ role: 'ADMIN', email });
  }

  if (!token) {
    return { error: 'Could not authenticate' };
  }

  await setSessionCookie(token);
  redirect('/admin/dashboard');
}

export async function loginStudentAction(formData: FormData) {
  const usn = formData.get('usn') as string;
  const dob = formData.get('dob') as string;

  if (!usn || !dob) {
    return { error: 'Please enter both USN and Date of Birth' };
  }

  let token: string | null = null;
  try {
    const res = await fetch(`${API_URL}/auth/student/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usn, dob }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      token = data.data?.accessToken;
    }
  } catch (err) {
    console.warn('API unreachable, using dev fallback token:', err);
  }

  if (!token && process.env.NODE_ENV !== 'production') {
    token = await createDevToken({ role: 'STUDENT', usn });
  }

  if (!token) {
    return { error: 'Could not authenticate' };
  }

  await setSessionCookie(token);
  redirect('/student/dashboard');
}

export async function loginDriverAction(formData: FormData) {
  const mobile = formData.get('mobile') as string;
  const otp = formData.get('otp') as string;

  if (!mobile || !otp) {
    return { error: 'Please enter both Mobile Number and OTP' };
  }

  let token: string | null = null;
  try {
    const res = await fetch(`${API_URL}/auth/driver/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, otp }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      token = data.data?.accessToken;
    }
  } catch (err) {
    console.warn('API unreachable, using dev fallback token:', err);
  }

  if (!token && process.env.NODE_ENV !== 'production') {
    token = await createDevToken({ role: 'DRIVER', mobile });
  }

  if (!token) {
    return { error: 'Could not authenticate' };
  }

  await setSessionCookie(token);
  redirect('/driver/dashboard');
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete('bts_session_token');
  redirect('/welcome');
}
