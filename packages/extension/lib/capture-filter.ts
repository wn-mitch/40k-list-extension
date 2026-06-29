/** A BCP host: bestcoastpairings.com or any subdomain of it. */
export const BCP_HOST_RE = /(^|\.)bestcoastpairings\.com$/;

// Static/asset paths that never carry list/event JSON — cheap noise filter.
const EXCLUDED_PATH_RE = /\.(js|mjs|css|png|jpe?g|gif|svg|woff2?|ico|map)(\?|$)/i;

/**
 * v1 capture rule: a BCP host serving a JSON response, excluding obvious
 * auth/static noise. Deliberately broad — narrowed against the real endpoints
 * once they are observed in 1b.
 */
export function shouldCapture(url: string, contentType: string | null): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!BCP_HOST_RE.test(parsed.hostname)) return false;
  if (parsed.pathname.startsWith("/auth")) return false;
  if (EXCLUDED_PATH_RE.test(parsed.pathname)) return false;
  return Boolean(contentType && contentType.toLowerCase().includes("application/json"));
}
