/** Shared HTTP helpers for the worker (ingestion + query share these). */

// CORS: the MV3 background fetch is privileged and usually skips CORS, but the
// same endpoints serve the browser web/admin + external bots — keep responses
// CORS-safe. `authorization` is allowed so browser clients can send bearer tokens.
export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,GET,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}
