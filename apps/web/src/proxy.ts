import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

function getEdgeSecretKey(): Uint8Array | null {
  const isProduction = process.env.NODE_ENV === 'production';
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret) {
    if (isProduction) {
      console.error(
        '[FATAL SECURITY CONFIGURATION ERROR] JWT_SECRET is unset in production mode. Rejecting authentication.',
      );
      return null;
    }
    console.warn(
      '[SECURITY WARNING] JWT_SECRET is not defined. Using development fallback key in non-production mode.',
    );
    return new TextEncoder().encode('super_secret_dev_key_change_in_prod');
  }

  return new TextEncoder().encode(secret);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 0. Gating development simulator routes: strictly block in production
  if (
    pathname.startsWith('/driver/simulator') &&
    process.env.NODE_ENV === 'production'
  ) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // 1. Allow login pages to be publicly accessed
  if (
    pathname === '/admin/login' ||
    pathname === '/student/login' ||
    pathname === '/driver/login'
  ) {
    return NextResponse.next();
  }

  // 2. Identify target route role
  const isAdminRoute = pathname.startsWith('/admin');
  const isStudentRoute = pathname.startsWith('/student');
  const isDriverRoute = pathname.startsWith('/driver');

  if (!isAdminRoute && !isStudentRoute && !isDriverRoute) {
    return NextResponse.next();
  }

  // Determine fallback login page based on target section
  const loginUrl = isAdminRoute
    ? new URL('/admin/login', request.url)
    : isStudentRoute
    ? new URL('/student/login', request.url)
    : new URL('/driver/login', request.url);

  // 3. Extract session token
  const token = request.cookies.get('bts_session_token')?.value;

  if (!token) {
    return NextResponse.redirect(loginUrl);
  }

  // Resolve secret key with production fail-fast enforcement
  const secretKey = getEdgeSecretKey();
  if (!secretKey) {
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse(
        JSON.stringify({
          error: 'Configuration Error',
          message:
            'Server authentication secret is not configured in production mode.',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    return NextResponse.redirect(loginUrl);
  }

  // 4. Verify JWT token using jose at the Edge
  try {
    const { payload } = await jwtVerify(token, secretKey);
    const role = (payload.role as string)?.toUpperCase();

    if (isAdminRoute && role !== 'ADMIN') {
      return NextResponse.redirect(loginUrl);
    }

    if (isStudentRoute && role !== 'STUDENT') {
      return NextResponse.redirect(loginUrl);
    }

    if (isDriverRoute && role !== 'DRIVER') {
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  } catch (_error) {
    // If token verification fails (expired, malformed, invalid signature)
    return NextResponse.redirect(loginUrl);
  }
}

export default proxy;

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
