/**
 * Phase 4 — admin moderation (the curing controls).
 *
 * Submissions land `pending` and are invisible to the query API until an admin
 * accepts them; bad sources can be blocked. Admin identity reuses the same
 * entitlement tokens as the query API, restricted to an allowlist of owner subs
 * (ADMIN_OWNERS). Like the query API, an unconfigured server refuses (501)
 * rather than opening moderation to any keyholder.
 *
 * This is the moderation *backend*; the visual admin panel (a Svelte SPA over
 * these endpoints) is front-end work tracked with the browse UI.
 */
import { authenticate, type VerifyEntitlementEnv } from "./verify-entitlement";
import { json } from "./http";
import { sha256Hex } from "./hash";

export interface AdminEnv extends VerifyEntitlementEnv {
  DB: D1Database;
  /** Comma-separated owner subs allowed to moderate (e.g. "key:admin"). */
  ADMIN_OWNERS?: string;
}

const SUBMISSION_STATUSES = ["pending", "accepted", "quarantined", "rejected"] as const;
type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

const PLAYER_CONSENT_STATES = ["opted_in", "excluded", "unknown"] as const;
type PlayerConsent = (typeof PLAYER_CONSENT_STATES)[number];

export interface PlayerConsentRequest {
  bcpPlayerId: string;
  consent: PlayerConsent;
  displayName: string | null;
}

type AdminAuth =
  | { ok: true; owner: string }
  | { ok: false; status: 401 | 403 | 501 };

async function requireAdmin(request: Request, env: AdminEnv): Promise<AdminAuth> {
  const auth = await authenticate(request, env);
  if (!auth.ok) return auth; // 401 (bad token) or 501 (no signer pinned)
  if (!env.ADMIN_OWNERS) return { ok: false, status: 501 }; // no admins configured
  const admins = env.ADMIN_OWNERS.split(",").map((s) => s.trim()).filter(Boolean);
  if (!admins.includes(auth.owner)) return { ok: false, status: 403 };
  return { ok: true, owner: auth.owner };
}

/** Route + gate an `/admin/*` request. */
export async function handleAdmin(
  request: Request,
  env: AdminEnv,
  url: URL,
): Promise<Response> {
  const admin = await requireAdmin(request, env);
  if (!admin.ok) {
    const error =
      admin.status === 501
        ? "admin not configured"
        : admin.status === 403
          ? "forbidden"
          : "unauthorized";
    return json({ ok: false, error }, admin.status);
  }

  const path = url.pathname;

  if (request.method === "GET" && path === "/admin/queue") {
    return adminQueue(env, url);
  }
  const statusMatch = path.match(/^\/admin\/submissions\/([^/]+)\/status$/);
  if (request.method === "POST" && statusMatch) {
    return setSubmissionStatus(request, env, decodeURIComponent(statusMatch[1]));
  }
  const blockMatch = path.match(/^\/admin\/submitters\/([^/]+)\/block$/);
  if (request.method === "POST" && blockMatch) {
    return setSubmitterBlocked(request, env, decodeURIComponent(blockMatch[1]));
  }
  if (request.method === "POST" && path === "/admin/players/consent") {
    return setPlayerConsent(request, env);
  }

  return json({ ok: false, error: "not found" }, 404);
}

interface QueueRow {
  id: string;
  submitter_id: string;
  received_at: number;
  status: string;
  list_count: number;
}

async function adminQueue(env: AdminEnv, url: URL): Promise<Response> {
  const status = url.searchParams.get("status") ?? "pending";
  if (!isStatus(status)) {
    return json({ ok: false, error: "invalid status filter" }, 400);
  }
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 50;

  const conditions = ["s.status = ?"];
  const params: unknown[] = [status];
  const cursor = url.searchParams.get("cursor");
  if (cursor) {
    conditions.push("s.id > ?");
    params.push(cursor);
  }

  const rows = await env.DB.prepare(
    `SELECT s.id, s.submitter_id, s.received_at, s.status,
            (SELECT count(*) FROM list_sources ls WHERE ls.submission_id = s.id) AS list_count
     FROM submissions s
     WHERE ${conditions.join(" AND ")}
     ORDER BY s.id
     LIMIT ?`,
  )
    .bind(...params, limit)
    .all<QueueRow>();

  const data = rows.results.map((r) => ({
    submissionId: r.id,
    submitterId: r.submitter_id,
    receivedAt: r.received_at,
    status: r.status,
    listCount: r.list_count,
  }));
  const nextKey = rows.results.length === limit && limit > 0 ? rows.results[rows.results.length - 1].id : null;
  return json({ ok: true, data, nextKey });
}

async function setSubmissionStatus(
  request: Request,
  env: AdminEnv,
  submissionId: string,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { status?: string } | null;
  if (!body || !isStatus(body.status)) {
    return json({ ok: false, error: `status must be one of ${SUBMISSION_STATUSES.join(", ")}` }, 400);
  }
  const result = await env.DB.prepare("UPDATE submissions SET status = ? WHERE id = ?")
    .bind(body.status, submissionId)
    .run();
  if (result.meta.changes === 0) {
    return json({ ok: false, error: "submission not found" }, 404);
  }
  return json({ ok: true, submissionId, status: body.status });
}

async function setSubmitterBlocked(
  request: Request,
  env: AdminEnv,
  submitterId: string,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { blocked?: boolean; reason?: string } | null;
  if (!body || typeof body.blocked !== "boolean") {
    return json({ ok: false, error: "blocked (boolean) required" }, 400);
  }
  const result = await env.DB.prepare(
    "UPDATE submitters SET blocked = ?, blocked_reason = ? WHERE id = ?",
  )
    .bind(body.blocked ? 1 : 0, body.blocked ? (body.reason ?? null) : null, submitterId)
    .run();
  if (result.meta.changes === 0) {
    return json({ ok: false, error: "submitter not found" }, 404);
  }
  return json({ ok: true, submitterId, blocked: body.blocked });
}

/**
 * Validate an admin consent-ops body. Pure (no DB) so it is unit-testable.
 * Opt-out is identity-suppression: `excluded`/`unknown` purge any supplied name.
 */
export function parsePlayerConsent(
  body: unknown,
): PlayerConsentRequest | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "bcpPlayerId required" };
  }
  const { bcpPlayerId, consent, displayName } = body as Record<string, unknown>;
  if (typeof bcpPlayerId !== "string" || bcpPlayerId.trim() === "") {
    return { error: "bcpPlayerId required" };
  }
  if (typeof consent !== "string" || !(PLAYER_CONSENT_STATES as readonly string[]).includes(consent)) {
    return { error: `consent must be one of ${PLAYER_CONSENT_STATES.join(", ")}` };
  }
  if (consent === "opted_in") {
    if (typeof displayName !== "string" || displayName.trim() === "") {
      return { error: "displayName required to be named" };
    }
    return { bcpPlayerId, consent, displayName: displayName.trim() };
  }
  // excluded / unknown — identity purge; any supplied name is ignored.
  return { bcpPlayerId, consent: consent as PlayerConsent, displayName: null };
}

async function setPlayerConsent(request: Request, env: AdminEnv): Promise<Response> {
  const parsed = parsePlayerConsent(await request.json().catch(() => null));
  if ("error" in parsed) {
    return json({ ok: false, error: parsed.error }, 400);
  }
  const hash = await sha256Hex(parsed.bcpPlayerId);
  const result = await env.DB.prepare(
    "UPDATE players SET consent = ?, display_name = ?, updated_at = ? WHERE bcp_player_id_hash = ?",
  )
    .bind(parsed.consent, parsed.displayName, Date.now(), hash)
    .run();
  if (result.meta.changes === 0) {
    return json({ ok: false, error: "player not found" }, 404);
  }
  // Identity-light response: never echo the name, raw id, or hash.
  return json({ ok: true, consent: parsed.consent, named: parsed.displayName !== null });
}

function isStatus(value: unknown): value is SubmissionStatus {
  return typeof value === "string" && (SUBMISSION_STATUSES as readonly string[]).includes(value);
}
