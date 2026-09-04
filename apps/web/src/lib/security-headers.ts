type SecurityHeaderName =
  | 'X-Frame-Options'
  | 'X-Content-Type-Options'
  | 'Referrer-Policy'
  | 'Content-Security-Policy'
  | 'Permissions-Policy';

export function buildSecurityHeaders(isDevelopment: boolean): Record<SecurityHeaderName, string> {
  const scriptSource = isDevelopment
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com"
    : "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com";

  return {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': `default-src 'self'; ${scriptSource}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://cdn.jsdelivr.net; mask-src 'self' https://cdn.jsdelivr.net; font-src 'self'; connect-src 'self'; frame-src https://challenges.cloudflare.com;`,
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
}
