import { NextResponse, type NextRequest } from 'next/server';
import { getPublicApiBaseUrlFromEnvironment, RuntimeConfigError } from '@/lib/runtime-config';
import { buildSecurityHeaders } from '@/lib/security-headers';

function createRuntimeConfigurationErrorResponse(): NextResponse {
  return new NextResponse('Runtime configuration is invalid', {
    status: 500,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function proxy(_request: NextRequest): NextResponse {
  try {
    const securityHeaders = buildSecurityHeaders(
      getPublicApiBaseUrlFromEnvironment(process.env),
      process.env.NODE_ENV !== 'production',
    );
    const response = NextResponse.next();

    for (const [name, value] of Object.entries(securityHeaders)) {
      response.headers.set(name, value);
    }

    return response;
  } catch (error) {
    if (error instanceof RuntimeConfigError) {
      return createRuntimeConfigurationErrorResponse();
    }

    throw error;
  }
}

export const config = {
  matcher: '/:path*',
};
