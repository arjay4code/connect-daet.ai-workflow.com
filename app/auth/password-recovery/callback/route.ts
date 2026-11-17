import { NextRequest, NextResponse } from 'next/server';

export function GET(request: NextRequest) {
  const callbackUrl = new URL('/auth/callback', request.url);
  request.nextUrl.searchParams.forEach((value, key) => {
    callbackUrl.searchParams.set(key, value);
  });
  callbackUrl.searchParams.set('next', '/reset-password');

  return NextResponse.redirect(callbackUrl);
}
