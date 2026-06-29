/**
 * Ingestion Worker.
 *
 * Accepts a {@link SubmissionEnvelope} from the extension, attributes it to a
 * (non-blocked) submitter, retains the raw payload verbatim in R2, records a
 * `pending` submission in D1, and projects the captured army lists into the
 * normalized D1 tables (see ./import). Raw is the source of truth; the D1
 * projection is rebuildable via /reprocess when the parser improves.
 */
import type { SubmissionEnvelope } from "@40kdc-meta/shared";
import { projectSubmission, reprocessSubmission, type ProjectionSummary } from "./import";
import { sha256Hex } from "./hash";
import { handleQuery } from "./query";
import { CORS_HEADERS, json } from "./http";

export interface Env {
  /** Normalized projection (queryable). */
  DB: D1Database;
  /** Immutable raw captures (source of truth). */
  RAW: R2Bucket;
  /** Enables the guarded /reprocess endpoint (off in production). */
  ALLOW_REPROCESS?: string;
  /** Pinned Ed25519 signer(s) for the /v1 query API (keys.alpacasoft.dev). */
  ENTITLEMENT_PUBLIC_KEYS?: string;
  /** Dev/test only: accept any bearer as the owner. NEVER set in production. */
  DEV_ALLOW_ALL?: string;
  /** Per-owner daily query cap (default 5000). */
  MAX_QUERIES_PER_DAY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "40kdc-meta-ingest" });
      }
      if (request.method === "POST" && url.pathname === "/ingest") {
        return await handleIngest(request, env);
      }
      if (request.method === "POST" && url.pathname === "/reprocess") {
        return await handleReprocess(request, env);
      }
      if (url.pathname === "/v1" || url.pathname.startsWith("/v1/")) {
        return await handleQuery(request, env, url);
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

  // Normalize + project into D1 on first insert. Raw is already safe in R2, so a
  // projection failure never fails ingestion — it can be re-run via /reprocess.
  let projected: ProjectionSummary | null = null;
  if (inserted) {
    try {
      projected = await projectSubmission(env, envelope, { submissionId, capturedAt: now });
    } catch (err) {
      console.error("projection failed", err);
    }
  }

  return json(
    {
      ok: true,
      submissionId: inserted ? submissionId : null,
      duplicate: !inserted,
      status: "pending",
      rawKey,
      projected,
    },
    inserted ? 202 : 200,
  );
}

async function handleReprocess(request: Request, env: Env): Promise<Response> {
  if (env.ALLOW_REPROCESS !== "true") return new Response("Not found", { status: 404 });
  const body = (await request.json().catch(() => null)) as { submissionId?: string } | null;
  if (!body || typeof body.submissionId !== "string") {
    return json({ ok: false, error: "submissionId required" }, 400);
  }
  const summary = await reprocessSubmission(env, body.submissionId);
  return json({ ok: true, ...summary });
}
