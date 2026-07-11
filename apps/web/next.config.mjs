import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== 'production';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@skynet/shared'],
  outputFileTracingRoot: path.join(__dirname, '../../'),
  async headers() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';
    let apiOrigin;
    try {
      apiOrigin = new URL(apiUrl).origin;
    } catch {
      apiOrigin = "'self'";
    }
    // webpack HMR in dev requires 'unsafe-eval'. Production must NOT have it.
    // TODO(tech-debt): Re-evaluate Turbopack when it supports Docker bind mount file watching.
    //   See: https://github.com/vercel/next.js/issues/80665
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'";
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Content-Security-Policy',
            value: `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ${apiOrigin};`,
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
