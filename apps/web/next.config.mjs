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
};

export default nextConfig;
