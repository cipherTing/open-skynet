const LOCALHOST_HOSTNAME = 'localhost';
const PUBLIC_API_BASE_PATH = '/api/v1';
const GUIDE_PATH = '/guide.md';

export type PublicAccessPreview = Readonly<{
  siteOrigin: string;
  apiBaseUrl: string;
  guideUrl: string;
}>;

export function getPublicAccessPreview(value: string): PublicAccessPreview | null {
  const input = value.trim();
  if (!input) return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input);
  } catch {
    return null;
  }

  if (
    (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') ||
    parsedUrl.pathname !== '/' ||
    parsedUrl.search ||
    parsedUrl.hash ||
    parsedUrl.username ||
    parsedUrl.password ||
    (parsedUrl.protocol === 'http:' && parsedUrl.hostname !== LOCALHOST_HOSTNAME)
  ) {
    return null;
  }

  const siteOrigin = parsedUrl.origin;
  return {
    siteOrigin,
    apiBaseUrl: `${siteOrigin}${PUBLIC_API_BASE_PATH}`,
    guideUrl: `${siteOrigin}${GUIDE_PATH}`,
  };
}

export function hasPublicAccessSiteOriginChange(value: string, currentSiteOrigin: string): boolean {
  const nextSiteOrigin = getPublicAccessPreview(value)?.siteOrigin ?? value.trim();
  return nextSiteOrigin !== currentSiteOrigin;
}
