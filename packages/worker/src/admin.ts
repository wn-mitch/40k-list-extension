/**
 * Phase 4/8: admin moderation (reactive).
 *
 * Lists are published anonymized on capture; moderation is reactive: a
 * submission is quarantined or rejected after the fact, which hides it from the
 * query API (and the public read tier). Bad sources can be blocked. Admin
 * identity reuses the same entitlement tokens as the query API, restricted to an
 * allowlist of owner subs (ADMIN_OWNERS). Like the query API, an unconfigured
 * server refuses (501) rather than opening moderation to any keyholder.
 *
 * This is the moderation *backend*; the visual admin panel (a Svelte SPA over
 * these endpoints) lives in `packages/web/`.
 */
import { authenticate, type VerifyEntitlementEnv } from "./verify-entitlement";
import { json } from "./http";
import { sha256Hex } from "./hash";
import { PLAYER_NAME } from "./query";

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
  const detailMatch = path.match(/^\/admin\/submissions\/([^/]+)$/);
  if (request.method === "GET" && detailMatch) {
    return adminSubmissionDetail(env, decodeURIComponent(detailMatch[1]));
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
  projection_error: string | null;
  list_count: number;
}

async function adminQueue(env: AdminEnv, url: URL): Promise<Response> {
  // Default to the firehose of freshly-accepted submissions (reactive moderation).
  const status = url.searchParams.get("status") ?? "accepted";
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
    `SELECT s.id, s.submitter_id, s.received_at, s.status, s.projection_error,
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
    projectionError: r.projection_error,
    listCount: r.list_count,
  }));
  const nextKey = rows.results.length === limit && limit > 0 ? rows.results[rows.results.length - 1].id : null;
  return json({ ok: true, data, nextKey });
}

interface DetailListRow {
  id: string;
  faction_id: string | null;
  detachment_ids: string;
  battle_size: string | null;
  points: number | null;
  share_token: string | null;
  import_format: string | null;
  placing: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  event_id: string | null;
  player_name: string | null;
  consent: string | null;
}

interface DetailUnitRow {
  list_id: string;
  unit_id: string | null;
  raw_name: string;
  model_count: number;
  is_warlord: number;
  enhancement_id: string | null;
  resolved: number;
}

/**
 * Full submission detail for the moderator. Unlike the public read tier this is
 * NOT accepted-gated: quarantined/rejected submissions (hidden from /public and
 * /v1) are inspectable here, which is the whole point of reactive moderation.
 * Player identity stays consent-gated (pseudonym unless opted_in); the raw
 * consent state is surfaced so the operator can act on it. Empty `lists` is a
 * valid result (a submission whose projection failed or yielded no list).
 */
async function adminSubmissionDetail(env: AdminEnv, submissionId: string): Promise<Response> {
  const submission = await env.DB.prepare(
    "SELECT id, submitter_id, raw_r2_key, payload_hash, received_at, status, projection_error FROM submissions WHERE id = ?",
  )
    .bind(submissionId)
    .first<{
      id: string;
      submitter_id: string;
      raw_r2_key: string;
      payload_hash: string;
      received_at: number;
      status: string;
      projection_error: string | null;
    }>();
  if (!submission) return json({ ok: false, error: "submission not found" }, 404);

  const lists = await env.DB.prepare(
    `SELECT l.id, l.faction_id, l.detachment_ids, l.battle_size, l.points, l.share_token, l.import_format,
            l.placing, l.wins, l.losses, l.draws, e.bcp_event_id AS event_id,
            ${PLAYER_NAME} AS player_name, p.consent AS consent
     FROM list_sources ls
     JOIN lists l ON l.id = ls.list_id
     LEFT JOIN events e ON e.id = l.event_id
     LEFT JOIN players p ON p.id = l.player_id
     WHERE ls.submission_id = ?
     ORDER BY l.id`,
  )
    .bind(submissionId)
    .all<DetailListRow>();

  // One round trip for every list's units (avoid an N+1 over list_sources).
  const listIds = lists.results.map((l) => l.id);
  const unitsByList = new Map<string, DetailUnitRow[]>();
  if (listIds.length > 0) {
    const placeholders = listIds.map(() => "?").join(",");
    const units = await env.DB.prepare(
      `SELECT list_id, unit_id, raw_name, model_count, is_warlord, enhancement_id, resolved
       FROM list_units WHERE list_id IN (${placeholders}) ORDER BY list_id, id`,
    )
      .bind(...listIds)
      .all<DetailUnitRow>();
    for (const u of units.results) {
      const arr = unitsByList.get(u.list_id);
      if (arr) arr.push(u);
      else unitsByList.set(u.list_id, [u]);
    }
  }

  return json({
    ok: true,
    submission: {
      submissionId: submission.id,
      submitterId: submission.submitter_id,
      rawKey: submission.raw_r2_key,
      payloadHash: submission.payload_hash,
      receivedAt: submission.received_at,
      status: submission.status,
      projectionError: submission.projection_error,
    },
    lists: lists.results.map((l) => {
      // Tolerate a malformed detachment_ids column rather than failing the view.
      let detachmentIds: string[] = [];
      try {
        const parsed = JSON.parse(l.detachment_ids);
        if (Array.isArray(parsed)) detachmentIds = parsed as string[];
      } catch {
        // keep the empty array
      }
      return {
        id: l.id,
        eventId: l.event_id,
        playerName: l.player_name,
        consent: l.consent,
        factionId: l.faction_id,
        detachmentIds,
        battleSize: l.battle_size,
        points: l.points,
        shareToken: l.share_token,
        importFormat: l.import_format,
        placement: { placing: l.placing, wins: l.wins, losses: l.losses, draws: l.draws },
        units: (unitsByList.get(l.id) ?? []).map((u) => ({
          unitId: u.unit_id,
          rawName: u.raw_name,
          modelCount: u.model_count,
          isWarlord: u.is_warlord === 1,
          enhancementId: u.enhancement_id,
          resolved: u.resolved === 1,
        })),
      };
    }),
  });
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
  // excluded / unknown: identity purge; any supplied name is ignored.
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
