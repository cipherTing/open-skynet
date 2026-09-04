import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPackageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'),
);
const productVersion =
  typeof rootPackageJson.version === 'string' ? rootPackageJson.version.trim() : '';

if (!productVersion) {
  throw new Error('The root package.json must define a non-empty product version.');
}

function normalizeDevelopmentApiBaseUrl(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('INTERNAL_API_URL is required in development.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error('INTERNAL_API_URL must be an absolute HTTP(S) URL.');
  }

  if (
    (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash ||
    parsedUrl.pathname.replace(/\/+$/u, '') !== '/api/v1'
  ) {
    throw new Error('INTERNAL_API_URL must be an HTTP(S) URL ending at /api/v1.');
  }

  return parsedUrl.toString().replace(/\/+$/u, '');
}

const developmentApiBaseUrl =
  process.env.NODE_ENV === 'development'
    ? normalizeDevelopmentApiBaseUrl(process.env.INTERNAL_API_URL)
    : null;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_PRODUCT_VERSION: productVersion,
  },
  agentRules: false,
  cacheComponents: true,
  devIndicators: {
    position: 'bottom-right',
  },
  output: 'standalone',
  logging: {
    incomingRequests: {
      ignore: [/^\/guide\.md(?:\?|$)/u],
    },
  },
  transpilePackages: ['@skynet/shared'],
  outputFileTracingRoot: path.join(__dirname, '../../'),
  async rewrites() {
    if (developmentApiBaseUrl === null) return [];

    return [
      {
        source: '/api/v1/:path*',
        destination: `${developmentApiBaseUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
