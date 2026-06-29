/**
 * Ingestion Worker — Phase 0 stub.
 *
 * Accepts a {@link SubmissionEnvelope} from the extension, attributes it to a
 * (non-blocked) submitter, retains the raw payload verbatim in R2, and records
 * a `pending` submission in D1. It deliberately does NOT normalize yet — curing
 * and normalization are later phases. The point of this stub is to prove the
 * R2 + D1 bindings wire up under `wrangler dev`.
 */
import type { SubmissionEnvelope } from "@40kdc-meta/shared";

export interface Env {
  /** Normalized projection (queryable). */
  DB: D1Database;
  /** Immutable raw captures (source of truth). */
  RAW: R2Bucket;
}

// CORS: the MV3 background fetch is privileged and usually skips CORS, but the
// same endpoints serve the browser web/admin later — make responses CORS-safe now.
const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,GET,OPTIONS",
  "access-control-allow-headers": "content-type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "40kdc-meta-ingest", phase: 0 });
      }
      if (request.method === "POST" && url.pathname === "/ingest") {
        return await handleIngest(request, env);
      }
      return new Response("Not found", { status: 404 });
    } catch (err) {
      return json({ ok: false, error: String(err) }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function handleIngest(request: Request, env: Env): Promise<Response> {
  const envelope = (await request.json().catch(() => null)) as SubmissionEnvelope | null;
  if (!envelope || typeof envelope.submitterId !== "string" || !Array.isArray(envelope.lists)) {
    return json({ ok: false, error: "malformed envelope" }, 400);
  }

  // Attribution + anti-abuse: blocked sources are rejected outright.
  const submitter = await env.DB.prepare("SELECT id, blocked FROM submitters WHERE id = ?")
    .bind(envelope.submitterId)
    .first<{ id: string; blocked: number }>();
  if (submitter?.blocked) {
    return json({ ok: false, error: "submitter blocked" }, 403);
  }

  const now = Date.now();
  if (!submitter) {
    await env.DB.prepare(
      "INSERT INTO submitters (id, install_key_hash, first_seen, blocked) VALUES (?, ?, ?, 0)",
    )
      .bind(envelope.submitterId, envelope.submitterId, now)
      .run();
  }

  // Retain the raw payload verbatim — this is what reprocessing reads forever.
  const rawBody = JSON.stringify(envelope.raw ?? envelope);
  const payloadHash = await sha256Hex(rawBody);
  const rawKey = `raw/${envelope.submitterId}/${envelope.capturedAt ?? now}-${payloadHash.slice(0, 12)}.json`;
  await env.RAW.put(rawKey, rawBody, { httpMetadata: { contentType: "application/json" } });

  // Land as pending (curing happens later). Idempotent per (submitter, payload).
  const submissionId = crypto.randomUUID();
  const insert = await env.DB.prepare(
    "INSERT OR IGNORE INTO submissions (id, submitter_id, raw_r2_key, payload_hash, received_at, status) VALUES (?, ?, ?, ?, ?, 'pending')",
  )
    .bind(submissionId, envelope.submitterId, rawKey, payloadHash, now)
    .run();

  const inserted = insert.meta.changes > 0;
  return json(
    {
      ok: true,
      submissionId: inserted ? submissionId : null,
      duplicate: !inserted,
      status: "pending",
      lists: envelope.lists.length,
      rawKey,
    },
    inserted ? 202 : 200,
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
