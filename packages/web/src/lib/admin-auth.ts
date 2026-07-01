// Pure, runtime-agnostic helpers for the admin auth flow + authed API client.
// Deliberately free of Svelte runes and `import.meta` so they run under the node
// test suite; the reactive state + fetch wiring lives in ./admin.svelte.ts.

/**
 * Discriminate a pasted secret. A pre-redeemed entitlement token is a
 * `<base64url>.<base64url>` envelope; it contains a dot that is neither the
 * first nor the last character. base64url itself never contains a `.`, so the
 * separator is unambiguous; anything without it is treated as a raw access key
 * to redeem at the keys service.
 */
export function looksLikeToken(secret: string): boolean {
  const s = secret.trim();
  const dot = s.indexOf(".");
  return dot > 0 && dot < s.length - 1;
}

/**
 * Map an admin API HTTP status to an operator-facing message. The fixed-meaning
 * statuses (401/403/501/429) get a tailored line; for anything else the server's
 * own `{error}` string wins when present, falling back to a generic message.
 */
export function adminErrorMessage(status: number, serverError?: string): string {
  switch (status) {
    case 401:
      return "Token rejected (missing, malformed, or expired); sign in again.";
    case 403:
      return "That token is valid but not an admin; its owner is not in ADMIN_OWNERS.";
    case 501:
      return "Admin is not configured on the server (no pinned signer or no ADMIN_OWNERS).";
    case 429:
      return "Daily quota exceeded; try again later.";
    default:
      return serverError && serverError.trim() ? serverError : `Request failed (HTTP ${status}).`;
  }
}
