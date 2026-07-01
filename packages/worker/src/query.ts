/**
 * Phase 5: key-authed read API (`/v1/*`) over the accepted list/event data.
 *
 * Every route is authenticated (bearer entitlement token from
 * keys.alpacasoft.dev, or DEV_ALLOW_ALL in dev), rate-limited per owner per UTC
 * day, and read-only. Data-exposure invariants, enforced in SQL on every query:
 *   - accepted-only: a list is visible only if some corroborating submission is
 *     `accepted` (pending/quarantined/rejected are never returned);
 *   - consent-gated identity: a player's display_name is returned only when
 *     consent = 'opted_in'; otherwise a stable pseudonym derived from (not
 *     equal to) the player-id hash, and never the raw hash.
 */
import { authenticate, type VerifyEntitlementEnv } from "./verify-entitlement";
import { json } from "./http";

export interface QueryEnv extends VerifyEntitlementEnv {
  DB: D1Database;
  MAX_QUERIES_PER_DAY?: string;
  /** Per-client-IP daily cap for the anonymous public read tier. */
  MAX_PUBLIC_QUERIES_PER_DAY?: string;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_MAX_QUERIES = 5000;
const DEFAULT_MAX_PUBLIC_QUERIES = 2000;

/** Accepted-only predicate for a list aliased `<alias>`. Alias is internal. */
function accepted(alias: string): string {
  return `EXISTS (SELECT 1 FROM list_sources ls JOIN submissions sub ON sub.id = ls.submission_id WHERE ls.list_id = ${alias}.id AND sub.status = 'accepted')`;
}

// Consent-gated display: real name only for opted-in players, else a stable
// pseudonym from the first 8 hex of the id hash (never the raw hash). Needs `p`.
export const PLAYER_NAME =
  "CASE WHEN p.consent = 'opted_in' THEN p.display_name ELSE 'player_' || substr(p.bcp_player_id_hash, 1, 8) END";

function pageLimit(url: URL): number {
  const raw = Number(url.searchParams.get("limit"));
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(raw), MAX_LIMIT);
}

/** Per-(owner|ip)/day quota using api_usage. Returns true when over the cap. */
async function overQuota(env: QueryEnv, owner: string, max: number): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
  const usage = await env.DB.prepare(
    "INSERT INTO api_usage (owner, day, count) VALUES (?, ?, 1) ON CONFLICT(owner, day) DO UPDATE SET count = count + 1 RETURNING count",
  )
    .bind(owner, day)
    .first<{ count: number }>();
  return Boolean(usage && usage.count > max);
}

/** Dispatch a data request whose API prefix (`/v1` or `/public`) is stripped. */
async function dispatch(env: QueryEnv, url: URL, path: string): Promise<Response> {
  if (path === "/events") return listEvents(env, url);
  const eventMatch = path.match(/^\/events\/([^/]+)$/);
  if (eventMatch) return getEvent(env, decodeURIComponent(eventMatch[1]));
  if (path === "/lists") return listLists(env, url);
  const listMatch = path.match(/^\/lists\/([^/]+)$/);
  if (listMatch) return getList(env, decodeURIComponent(listMatch[1]));
  if (path === "/stats/units") return statsUnits(env, url);
  if (path === "/stats/factions") return statsFactions(env, url);
  if (path === "/stats/bif") return statsBif(env, url);
  return json({ ok: false, error: "not found" }, 404);
}

/** Key-authed `/v1/*` query API (entitlement token + per-owner daily quota). */
export async function handleQuery(request: Request, env: QueryEnv, url: URL): Promise<Response> {
  if (request.method !== "GET") {
    return json({ ok: false, error: "method not allowed" }, 405);
  }
  const auth = await authenticate(request, env);
  if (!auth.ok) {
    const error = auth.status === 501 ? "query API not configured" : "unauthorized";
    return json({ ok: false, error }, auth.status);
  }
  if (await overQuota(env, auth.owner, Number(env.MAX_QUERIES_PER_DAY) || DEFAULT_MAX_QUERIES)) {
    return json({ ok: false, error: "daily quota exceeded" }, 429);
  }
  const path = url.pathname.slice("/v1".length);
  if (path === "/me") return json({ ok: true, owner: auth.owner });
  return dispatch(env, url, path);
}

/** Anonymous public read tier (`/public/*`): same accepted-only + consent-gated
 *  data as `/v1`, no token, rate-limited per client IP. */
export async function handlePublicQuery(request: Request, env: QueryEnv, url: URL): Promise<Response> {
  if (request.method !== "GET") {
    return json({ ok: false, error: "method not allowed" }, 405);
  }
  const ip = request.headers.get("cf-connecting-ip") ?? "anon";
  const max = Number(env.MAX_PUBLIC_QUERIES_PER_DAY) || DEFAULT_MAX_PUBLIC_QUERIES;
  if (await overQuota(env, `public:${ip}`, max)) {
    return json({ ok: false, error: "daily quota exceeded" }, 429);
  }
  return dispatch(env, url, url.pathname.slice("/public".length));
}

// --- /v1/events -------------------------------------------------------------

interface EventRow {
  bcp_event_id: string;
  name: string | null;
  date: string | null;
  format: string | null;
  region: string | null;
  list_count: number;
}

async function listEvents(env: QueryEnv, url: URL): Promise<Response> {
  const conditions = [`EXISTS (SELECT 1 FROM lists l WHERE l.event_id = e.id AND ${accepted("l")})`];
  const params: unknown[] = [];

  const format = url.searchParams.get("format");
  if (format) {
    conditions.push("e.format = ?");
    params.push(format);
  }
  const region = url.searchParams.get("region");
  if (region) {
    conditions.push("e.region = ?");
    params.push(region);
  }
  const since = url.searchParams.get("since");
  if (since) {
    conditions.push("e.date >= ?");
    params.push(since);
  }
  const cursor = url.searchParams.get("cursor");
  if (cursor) {
    conditions.push("e.id > ?");
    params.push(cursor);
  }

  const limit = pageLimit(url);
  const rows = await env.DB.prepare(
    `SELECT e.id, e.bcp_event_id, e.name, e.date, e.format, e.region,
            (SELECT count(*) FROM lists l WHERE l.event_id = e.id AND ${accepted("l")}) AS list_count
     FROM events e
     WHERE ${conditions.join(" AND ")}
     ORDER BY e.id
     LIMIT ?`,
  )
    .bind(...params, limit)
    .all<EventRow & { id: string }>();

  const data = rows.results.map((r) => ({
    eventId: r.bcp_event_id,
    name: r.name,
    date: r.date,
    format: r.format,
    region: r.region,
    listCount: r.list_count,
  }));
  return json({ ok: true, data, nextKey: nextKeyFor(rows.results, limit) });
}

async function getEvent(env: QueryEnv, bcpEventId: string): Promise<Response> {
  const event = await env.DB.prepare(
    "SELECT id, bcp_event_id, name, date, format, region FROM events WHERE bcp_event_id = ?",
  )
    .bind(bcpEventId)
    .first<{ id: string; bcp_event_id: string; name: string | null; date: string | null; format: string | null; region: string | null }>();
  if (!event) return json({ ok: false, error: "event not found" }, 404);

  const lists = await env.DB.prepare(
    `SELECT l.id, l.faction_id, l.points, l.warnings, l.placing, l.wins, l.losses, l.draws, ${PLAYER_NAME} AS player_name
     FROM lists l
     LEFT JOIN players p ON p.id = l.player_id
     WHERE l.event_id = ? AND ${accepted("l")}
     ORDER BY (l.placing IS NULL), l.placing, l.id`,
  )
    .bind(event.id)
    .all<{ id: string; faction_id: string | null; points: number | null; warnings: string | null; placing: number | null; wins: number | null; losses: number | null; draws: number | null; player_name: string | null }>();

  return json({
    ok: true,
    event: {
      eventId: event.bcp_event_id,
      name: event.name,
      date: event.date,
      format: event.format,
      region: event.region,
    },
    lists: lists.results.map((l) => {
      const warnings = parseWarnings(l.warnings, l.id);
      return {
        id: l.id,
        factionId: l.faction_id,
        playerName: l.player_name,
        points: l.points,
        warningCount: warnings == null ? null : warnings.length,
        placement: { placing: l.placing, wins: l.wins, losses: l.losses, draws: l.draws },
      };
    }),
  });
}

// --- /v1/lists --------------------------------------------------------------

interface ListRow {
  id: string;
  faction_id: string | null;
  detachment_ids: string;
  battle_size: string | null;
  points: number | null;
  points_reported: number | null;
  points_computed: number | null;
  declared_limit: number | null;
  warnings: string | null;
  share_token: string | null;
  import_format: string | null;
  placing: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  event_id: string | null;
  player_name: string | null;
}

/** One importer diagnostic, as persisted on the list row. */
interface ListWarning {
  code: string;
  message: string;
  raw_name: string | null;
}

/**
 * Parse a persisted `warnings` JSON column. Pre-p1 rows hold NULL (unknown, not
 * clean) and map to null; a malformed column is logged and treated the same so
 * one bad row can't fail a whole query.
 */
function parseWarnings(raw: string | null, listId: string): ListWarning[] | null {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as ListWarning[];
  } catch {
    // fall through to the log below
  }
  console.warn("malformed warnings column on list", listId);
  return null;
}

async function listLists(env: QueryEnv, url: URL): Promise<Response> {
  const conditions = [accepted("l")];
  const params: unknown[] = [];

  const eventId = url.searchParams.get("eventId");
  if (eventId) {
    conditions.push("e.bcp_event_id = ?");
    params.push(eventId);
  }
  const factionId = url.searchParams.get("factionId");
  if (factionId) {
    conditions.push("l.faction_id = ?");
    params.push(factionId);
  }
  const format = url.searchParams.get("format");
  if (format) {
    conditions.push("l.import_format = ?");
    params.push(format);
  }
  const detachmentId = url.searchParams.get("detachmentId");
  if (detachmentId) {
    conditions.push("EXISTS (SELECT 1 FROM json_each(l.detachment_ids) WHERE value = ?)");
    params.push(detachmentId);
  }
  const unitId = url.searchParams.get("unitId");
  if (unitId) {
    conditions.push("EXISTS (SELECT 1 FROM list_units u WHERE u.list_id = l.id AND u.unit_id = ?)");
    params.push(unitId);
  }
  const cursor = url.searchParams.get("cursor");
  if (cursor) {
    conditions.push("l.id > ?");
    params.push(cursor);
  }

  const limit = pageLimit(url);
  const rows = await env.DB.prepare(
    `SELECT l.id, l.faction_id, l.detachment_ids, l.battle_size, l.points, l.points_reported,
            l.points_computed, l.declared_limit, l.warnings, l.share_token, l.import_format,
            l.placing, l.wins, l.losses, l.draws, e.bcp_event_id AS event_id, ${PLAYER_NAME} AS player_name
     FROM lists l
     LEFT JOIN events e ON e.id = l.event_id
     LEFT JOIN players p ON p.id = l.player_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY l.id
     LIMIT ?`,
  )
    .bind(...params, limit)
    .all<ListRow>();

  const data = rows.results.map(listSummary);
  return json({ ok: true, data, nextKey: nextKeyFor(rows.results, limit) });
}

async function getList(env: QueryEnv, id: string): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT l.id, l.faction_id, l.detachment_ids, l.battle_size, l.points, l.points_reported,
            l.points_computed, l.declared_limit, l.warnings, l.share_token, l.import_format,
            l.placing, l.wins, l.losses, l.draws, e.bcp_event_id AS event_id, ${PLAYER_NAME} AS player_name
     FROM lists l
     LEFT JOIN events e ON e.id = l.event_id
     LEFT JOIN players p ON p.id = l.player_id
     WHERE l.id = ? AND ${accepted("l")}`,
  )
    .bind(id)
    .first<ListRow>();
  if (!row) return json({ ok: false, error: "list not found" }, 404);

  const units = await env.DB.prepare(
    "SELECT unit_id, raw_name, model_count, is_warlord, enhancement_id, resolved FROM list_units WHERE list_id = ? ORDER BY id",
  )
    .bind(id)
    .all<{ unit_id: string | null; raw_name: string; model_count: number; is_warlord: number; enhancement_id: string | null; resolved: number }>();

  return json({
    ok: true,
    list: {
      ...listSummary(row),
      // Detail carries the full diagnostics; summaries only carry the count.
      warnings: parseWarnings(row.warnings, row.id),
      units: units.results.map((u) => ({
        unitId: u.unit_id,
        rawName: u.raw_name,
        modelCount: u.model_count,
        isWarlord: u.is_warlord === 1,
        enhancementId: u.enhancement_id,
        resolved: u.resolved === 1,
      })),
    },
  });
}

function listSummary(r: ListRow) {
  let detachmentIds: string[] = [];
  try {
    const parsed = JSON.parse(r.detachment_ids);
    if (Array.isArray(parsed)) detachmentIds = parsed as string[];
  } catch {
    // tolerate a malformed JSON column rather than failing the whole query,
    // but leave a trace so the corruption is findable
    console.warn("malformed detachment_ids column on list", r.id);
  }
  const warnings = parseWarnings(r.warnings, r.id);
  return {
    id: r.id,
    eventId: r.event_id,
    playerName: r.player_name,
    factionId: r.faction_id,
    detachmentIds,
    battleSize: r.battle_size,
    // `points` is the headline (as-pasted when reported, else computed); the
    // reported/computed pair makes its provenance explicit. None of these are a
    // legality verdict: this API archives lists, it does not validate them.
    points: r.points,
    pointsReported: r.points_reported,
    pointsComputed: r.points_computed,
    declaredLimit: r.declared_limit,
    /** Importer warning count; null when unknown (row predates diagnostics). */
    warningCount: warnings == null ? null : warnings.length,
    shareToken: r.share_token,
    importFormat: r.import_format,
    placement: { placing: r.placing, wins: r.wins, losses: r.losses, draws: r.draws },
  };
}

// --- /v1/stats/* ------------------------------------------------------------

/** Build the shared "accepted list in scope" clause + params for stats. */
function statsScope(url: URL, alias: string): { where: string; params: unknown[] } {
  const conditions = [accepted(alias)];
  const params: unknown[] = [];
  const format = url.searchParams.get("format");
  if (format) {
    conditions.push(`${alias}.import_format = ?`);
    params.push(format);
  }
  const factionId = url.searchParams.get("factionId");
  if (factionId) {
    conditions.push(`${alias}.faction_id = ?`);
    params.push(factionId);
  }
  const since = url.searchParams.get("since");
  if (since) {
    conditions.push(`${alias}.event_id IN (SELECT id FROM events WHERE date >= ?)`);
    params.push(since);
  }
  return { where: conditions.join(" AND "), params };
}

async function totalLists(env: QueryEnv, scope: { where: string; params: unknown[] }): Promise<number> {
  const row = await env.DB.prepare(`SELECT count(*) AS n FROM lists l WHERE ${scope.where}`)
    .bind(...scope.params)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function statsUnits(env: QueryEnv, url: URL): Promise<Response> {
  const scope = statsScope(url, "l");
  const limit = pageLimit(url);
  const rows = await env.DB.prepare(
    `SELECT u.unit_id, count(DISTINCT l.id) AS lists_with
     FROM list_units u JOIN lists l ON l.id = u.list_id
     WHERE u.unit_id IS NOT NULL AND ${scope.where}
     GROUP BY u.unit_id
     ORDER BY lists_with DESC, u.unit_id
     LIMIT ?`,
  )
    .bind(...scope.params, limit)
    .all<{ unit_id: string; lists_with: number }>();

  const total = await totalLists(env, scope);
  const data = rows.results.map((r) => ({
    unitId: r.unit_id,
    count: r.lists_with,
    share: total > 0 ? r.lists_with / total : 0,
  }));
  return json({ ok: true, totalLists: total, data });
}

async function statsFactions(env: QueryEnv, url: URL): Promise<Response> {
  const scope = statsScope(url, "l");
  const rows = await env.DB.prepare(
    `SELECT l.faction_id, count(*) AS cnt
     FROM lists l
     WHERE l.faction_id IS NOT NULL AND ${scope.where}
     GROUP BY l.faction_id
     ORDER BY cnt DESC, l.faction_id`,
  )
    .bind(...scope.params)
    .all<{ faction_id: string; cnt: number }>();

  const total = await totalLists(env, scope);
  const data = rows.results.map((r) => ({
    factionId: r.faction_id,
    count: r.cnt,
    share: total > 0 ? r.cnt / total : 0,
  }));
  return json({ ok: true, totalLists: total, data });
}

async function statsBif(env: QueryEnv, url: URL): Promise<Response> {
  // Top-placing accepted list per faction in the window: the row whose placing
  // equals the per-faction minimum. The scope clause is applied to the outer
  // (lo) and inner (li) lists separately; identical params bind in order.
  const outer = statsScope(url, "lo");
  const inner = statsScope(url, "li");
  const rows = await env.DB.prepare(
    `SELECT lo.faction_id, lo.id, lo.placing, lo.points, lo.import_format,
            e.bcp_event_id AS event_id, ${PLAYER_NAME} AS player_name
     FROM lists lo
     LEFT JOIN events e ON e.id = lo.event_id
     LEFT JOIN players p ON p.id = lo.player_id
     WHERE lo.faction_id IS NOT NULL AND lo.placing IS NOT NULL AND ${outer.where}
       AND lo.placing = (
         SELECT min(li.placing) FROM lists li
         WHERE li.faction_id = lo.faction_id AND li.placing IS NOT NULL AND ${inner.where}
       )
     GROUP BY lo.faction_id
     ORDER BY lo.faction_id`,
  )
    .bind(...outer.params, ...inner.params)
    .all<{ faction_id: string; id: string; placing: number; points: number | null; import_format: string | null; event_id: string | null; player_name: string | null }>();

  const data = rows.results.map((r) => ({
    factionId: r.faction_id,
    listId: r.id,
    eventId: r.event_id,
    playerName: r.player_name,
    placing: r.placing,
    points: r.points,
    importFormat: r.import_format,
  }));
  return json({ ok: true, data });
}

/** Keyset cursor: the last row's id when the page was full, else null. */
function nextKeyFor(rows: { id: string }[], limit: number): string | null {
  return rows.length === limit && rows.length > 0 ? rows[rows.length - 1].id : null;
}
