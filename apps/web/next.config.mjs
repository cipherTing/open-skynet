import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
