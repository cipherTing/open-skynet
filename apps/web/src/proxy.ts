import { NextResponse, type NextRequest } from 'next/server';
import { buildSecurityHeaders } from '@/lib/security-headers';

export function proxy(_request: NextRequest): NextResponse {
  const securityHeaders = buildSecurityHeaders(process.env.NODE_ENV !== 'production');
  const response = NextResponse.next();

  for (const [name, value] of Object.entries(securityHeaders)) {
    response.headers.set(name, value);
  }

  return response;
}

export const config = {
  matcher: '/:path*',
};
