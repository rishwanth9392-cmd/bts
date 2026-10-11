import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key_change_in_prod';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { role, email, password, usn, dob, mobile, otp } = body;

    let targetUrl = '';
    let payload: Record<string, unknown> = {};
    const determinedRole = (role || (email ? 'admin' : usn ? 'student' : 'driver')).toLowerCase();

    if (determinedRole === 'admin' || (email && password)) {
      targetUrl = `${API_URL}/auth/admin/login`;
      payload = { email, password };
    } else if (determinedRole === 'student' || (usn && dob)) {
      targetUrl = `${API_URL}/auth/student/login`;
      payload = { usn, dob };
    } else if (determinedRole === 'driver' || (mobile && otp)) {
      targetUrl = `${API_URL}/auth/driver/login`;
      payload = { mobile, otp };
    } else {
      return NextResponse.json(
        { success: false, error: { message: 'Invalid login payload or role' } },
        { status: 400 }
      );
    }

    let accessToken: string | null = null;

    try {
      const apiRes = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const resJson = await apiRes.json();

      if (apiRes.ok && resJson.success) {
        accessToken = resJson.data?.accessToken || null;
      } else if (process.env.NODE_ENV === 'production') {
        const errorMessage =
          resJson.error?.message || resJson.message || 'Authentication failed';
        return NextResponse.json(
          { success: false, error: { message: errorMessage } },
          { status: apiRes.status || 401 }
        );
      }
    } catch (networkError) {
      if (process.env.NODE_ENV === 'production') {
        throw networkError;
      }
      console.warn('Backend API unavailable. Utilizing development authentication fallback.');
    }

    // Dev fallback if API is not running
    if (!accessToken && process.env.NODE_ENV !== 'production') {
      const secret = new TextEncoder().encode(JWT_SECRET);
      accessToken = await new SignJWT({
        sub: email || usn || mobile || 'demo-user',
        role: determinedRole.toUpperCase(),
        email: email || (determinedRole === 'admin' ? 'admin@bmsit.edu' : undefined),
        usn: usn || (determinedRole === 'student' ? '1BM21CS001' : undefined),
        mobile: mobile || (determinedRole === 'driver' ? '9876543210' : undefined),
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h')
        .sign(secret);
    }

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: { message: 'No access token returned' } },
        { status: 500 }
      );
    }

    const cookieStore = await cookies();
    cookieStore.set('bts_session_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return NextResponse.json({
      success: true,
      data: { role: determinedRole },
    });
  } catch (error) {
    console.error('Login Route Error:', error);
    return NextResponse.json(
      { success: false, error: { message: 'Internal server error during login' } },
      { status: 500 }
    );
  }
}
