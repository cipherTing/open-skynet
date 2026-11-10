import { NextResponse, type NextRequest } from 'next/server';
import { buildSecurityHeaders } from '@/lib/security-headers';

export function proxy(request: NextRequest): NextResponse {
  const securityHeaders = buildSecurityHeaders(
    process.env.NODE_ENV !== 'production',
    request.nextUrl.pathname,
  );
  const response = NextResponse.next();

  for (const [name, value] of Object.entries(securityHeaders)) {
    response.headers.set(name, value);
  }

  return response;
}

export const config = {
  matcher: '/:path*',
};
