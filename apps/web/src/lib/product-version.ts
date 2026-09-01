const configuredProductVersion = process.env.NEXT_PUBLIC_PRODUCT_VERSION?.trim();

if (!configuredProductVersion) {
  throw new Error('NEXT_PUBLIC_PRODUCT_VERSION is not configured.');
}

export const PRODUCT_VERSION = configuredProductVersion;
