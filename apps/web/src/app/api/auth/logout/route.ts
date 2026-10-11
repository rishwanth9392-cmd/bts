import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const cookieStore = await cookies();
  cookieStore.delete('bts_session_token');

  const { searchParams } = new URL(request.url);
  const redirectTo = searchParams.get('redirect') || '/welcome';

  return NextResponse.redirect(new URL(redirectTo, request.url));
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  cookieStore.delete('bts_session_token');

  const { searchParams } = new URL(request.url);
  const redirectTo = searchParams.get('redirect') || '/welcome';

  return NextResponse.redirect(new URL(redirectTo, request.url));
}
