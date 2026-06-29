/**
 * BCP's API host, pinned from a live authenticated session (Phase 1b). The web
 * app (any `*.bestcoastpairings.com` origin) makes its data requests here; the
 * MAIN-world interceptor sees them because it patches the page's own `fetch`.
 */
export const BCP_API_HOST = "newprod-api.bestcoastpairings.com";

/**
 * Data-bearing endpoints we keep: army lists and event/player/pairing data.
 * Pure-catalog lookups (`/v1/gamesystems`, `/v1/leagues`, `/v1/scorecards`, …)
 * are dropped as noise. Extend this allowlist as new useful endpoints surface.
 */
const CAPTURE_PATH_RE = /^\/v1\/(armylists|events|pairings)(\/|$)/;

/**
 * Capture rule: a JSON response from BCP's API host on a data-bearing endpoint.
 * Positive allowlist — anything not explicitly matched is ignored.
 */
export function shouldCapture(url: string, contentType: string | null): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.hostname !== BCP_API_HOST) return false;
  if (!CAPTURE_PATH_RE.test(parsed.pathname)) return false;
  return Boolean(contentType && contentType.toLowerCase().includes("application/json"));
}
