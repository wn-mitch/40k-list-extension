/**
 * Phase 3 — normalize captured BCP army lists into the D1 projection.
 *
 * Split in two so the meaty logic is pure and unit-testable without a database:
 *   - {@link planProjection}: extract `/v1/armylists` responses from a
 *     submission's captures, run the normalizer, and shape the rows to write.
 *   - {@link applyProjection}: idempotently write those rows to D1 (dedup lists
 *     by content_hash, corroborate via list_sources, append coverage).
 *
 * R2 raw is the source of truth; D1 is a rebuildable projection stamped with
 * `parser_version`, so {@link reprocessSubmission} re-derives rows from raw when
 * the parser improves — a rerun, not a migration.
 *
 * Privacy: only `bcp_player_id_hash` is persisted (sha256 of the BCP player id);
 * display names are never written here (consent defaults to 'unknown').
 */
import type {
  BcpArmyListResponse,
  BcpListCapture,
  CapturedResponse,
  SubmissionEnvelope,
} from "@40kdc-meta/shared";
import { normalizeList } from "@40kdc-meta/normalizer";
import { sha256Hex } from "./hash";

/** Minimal binding surface the projection needs (a subset of the Worker Env). */
export interface ProjectionEnv {
  DB: D1Database;
  RAW: R2Bucket;
}

export interface PlannedEvent {
  bcpEventId: string;
  name: string | null;
  date: string | null;
  format: string | null;
  region: string | null;
}

export interface PlannedPlayer {
  bcpPlayerIdHash: string;
}

export interface PlannedUnit {
  unitId: string | null;
  rawName: string;
  modelCount: number;
  isWarlord: boolean;
  enhancementId: string | null;
  resolved: boolean;
}

export interface PlannedList {
  contentHash: string;
  /** False when the pasted text matched no known army-builder format. */
  ok: boolean;
  factionId: string | null;
  detachmentIds: string[];
  battleSize: string | null;
  points: number | null;
  shareToken: string | null;
  importFormat: string | null;
  parserVersion: string;
  listText: string;
  event: PlannedEvent | null;
  player: PlannedPlayer | null;
  placement: { placing: number | null; wins: number | null; losses: number | null; draws: number | null };
  units: PlannedUnit[];
  coverage: {
    format: string | null;
    parserVersion: string;
    unresolvedUnits: number;
    totalUnits: number;
  };
}

export interface ProjectionPlan {
  lists: PlannedList[];
}

export interface ProjectionSummary {
  /** Army lists found in the submission. */
  lists: number;
  /** Lists newly inserted (not already present by content_hash). */
  newLists: number;
  units: number;
  resolvedUnits: number;
}

/** Single army list, or a paginated `/v1/armylists` collection. */
const ARMYLIST_PATH_RE = /^\/v1\/armylists(\/[^/]+)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isArmyList(value: unknown): value is BcpArmyListResponse {
  return (
    isRecord(value) &&
    typeof value.armyListText === "string" &&
    typeof value.id === "string"
  );
}

/** Captures live in `captures` (live ingest) or `raw.captures` (reprocessing). */
function capturesOf(source: {
  captures?: CapturedResponse[];
  raw?: unknown;
}): CapturedResponse[] {
  if (Array.isArray(source.captures)) return source.captures;
  if (isRecord(source.raw) && Array.isArray(source.raw.captures)) {
    return source.raw.captures as CapturedResponse[];
  }
  return [];
}

function extractArmyLists(captures: CapturedResponse[]): BcpArmyListResponse[] {
  const out: BcpArmyListResponse[] = [];
  for (const capture of captures) {
    let path: string;
    try {
      path = new URL(capture.url).pathname;
    } catch {
      continue;
    }
    if (!ARMYLIST_PATH_RE.test(path)) continue;

    const body = capture.body;
    if (isArmyList(body)) {
      out.push(body);
    } else if (isRecord(body) && Array.isArray(body.data)) {
      for (const item of body.data) if (isArmyList(item)) out.push(item);
    }
  }
  return out;
}

function toCapture(armyList: BcpArmyListResponse): BcpListCapture {
  const metrics = armyList.player?.metrics ?? null;
  return {
    eventId: armyList.eventId ?? armyList.event?.id ?? "",
    playerId: armyList.playerId ?? armyList.player?.id ?? null,
    // Never persist the display name — only the hashed player id is stored.
    playerName: null,
    listText: armyList.armyListText,
    placement: metrics
      ? {
          rank: metrics.placing ?? null,
          wins: metrics.wins ?? null,
          losses: metrics.losses ?? null,
          draws: metrics.draws ?? null,
        }
      : null,
  };
}

/**
 * Pure: turn a submission's captures into the rows to project. Async only
 * because normalization + hashing use Web Crypto; no I/O, deterministic.
 */
export async function planProjection(source: {
  captures?: CapturedResponse[];
  raw?: unknown;
}): Promise<ProjectionPlan> {
  const armyLists = extractArmyLists(capturesOf(source));
  const lists: PlannedList[] = [];

  for (const armyList of armyLists) {
    const capture = toCapture(armyList);
    const normalized = await normalizeList(capture);

    const event: PlannedEvent | null = capture.eventId
      ? {
          bcpEventId: capture.eventId,
          name: armyList.event?.name ?? null,
          date: armyList.event?.eventDate ?? null,
          format: null,
          region: null,
        }
      : null;

    const player: PlannedPlayer | null = capture.playerId
      ? { bcpPlayerIdHash: await sha256Hex(capture.playerId) }
      : null;

    lists.push({
      contentHash: normalized.content_hash,
      ok: normalized.ok,
      factionId: normalized.faction_id,
      detachmentIds: normalized.detachment_ids,
      battleSize: normalized.battle_size,
      points: normalized.points,
      shareToken: normalized.share_token,
      importFormat: normalized.format,
      parserVersion: normalized.parser_version,
      listText: capture.listText,
      event,
      player,
      placement: {
        placing: capture.placement?.rank ?? null,
        wins: capture.placement?.wins ?? null,
        losses: capture.placement?.losses ?? null,
        draws: capture.placement?.draws ?? null,
      },
      units: normalized.units.map((u) => ({
        unitId: u.unit_id,
        rawName: u.raw_name,
        modelCount: u.model_count,
        isWarlord: u.is_warlord,
        enhancementId: u.enhancement_id,
        resolved: u.resolved,
      })),
      coverage: {
        format: normalized.format,
        parserVersion: normalized.parser_version,
        unresolvedUnits: normalized.total_units - normalized.resolved_units,
        totalUnits: normalized.total_units,
      },
    });
  }

  return { lists };
}

async function upsertEvent(
  env: ProjectionEnv,
  event: PlannedEvent,
  capturedAt: number,
): Promise<string> {
  await env.DB.prepare(
    `INSERT INTO events (id, bcp_event_id, name, date, format, region, captured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(bcp_event_id) DO UPDATE SET
       name = COALESCE(excluded.name, events.name),
       date = COALESCE(excluded.date, events.date),
       format = COALESCE(excluded.format, events.format),
       region = COALESCE(excluded.region, events.region)`,
  )
    .bind(
      crypto.randomUUID(),
      event.bcpEventId,
      event.name,
      event.date,
      event.format,
      event.region,
      capturedAt,
    )
    .run();
  const row = await env.DB.prepare("SELECT id FROM events WHERE bcp_event_id = ?")
    .bind(event.bcpEventId)
    .first<{ id: string }>();
  if (!row) throw new Error("event upsert returned no row");
  return row.id;
}

async function upsertPlayer(
  env: ProjectionEnv,
  player: PlannedPlayer,
  updatedAt: number,
): Promise<string> {
  await env.DB.prepare(
    `INSERT INTO players (id, bcp_player_id_hash, display_name, consent, updated_at)
     VALUES (?, ?, NULL, 'unknown', ?)
     ON CONFLICT(bcp_player_id_hash) DO UPDATE SET updated_at = excluded.updated_at`,
  )
    .bind(crypto.randomUUID(), player.bcpPlayerIdHash, updatedAt)
    .run();
  const row = await env.DB.prepare(
    "SELECT id FROM players WHERE bcp_player_id_hash = ?",
  )
    .bind(player.bcpPlayerIdHash)
    .first<{ id: string }>();
  if (!row) throw new Error("player upsert returned no row");
  return row.id;
}

async function writeUnitsAndCoverage(
  env: ProjectionEnv,
  listId: string,
  list: PlannedList,
  capturedAt: number,
): Promise<void> {
  await env.DB.prepare("DELETE FROM list_units WHERE list_id = ?").bind(listId).run();
  for (const unit of list.units) {
    await env.DB.prepare(
      `INSERT INTO list_units (id, list_id, unit_id, raw_name, model_count, is_warlord, enhancement_id, resolved)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        listId,
        unit.unitId,
        unit.rawName,
        unit.modelCount,
        unit.isWarlord ? 1 : 0,
        unit.enhancementId,
        unit.resolved ? 1 : 0,
      )
      .run();
  }
  await env.DB.prepare(
    `INSERT INTO coverage (captured_at, format, parser_version, unresolved_units, total_units)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(
      capturedAt,
      list.coverage.format,
      list.coverage.parserVersion,
      list.coverage.unresolvedUnits,
      list.coverage.totalUnits,
    )
    .run();
}

/**
 * Idempotently write a {@link ProjectionPlan} to D1. Lists dedup by
 * content_hash; a list's units + coverage are (re)derived only when the row is
 * new or the parser_version changed. list_sources always records the submission
 * as a corroborating source.
 */
export async function applyProjection(
  env: ProjectionEnv,
  plan: ProjectionPlan,
  ctx: { submissionId: string; capturedAt: number },
): Promise<ProjectionSummary> {
  let newLists = 0;
  let units = 0;
  let resolvedUnits = 0;

  for (const list of plan.lists) {
    const eventId = list.event
      ? await upsertEvent(env, list.event, ctx.capturedAt)
      : null;
    const playerId = list.player
      ? await upsertPlayer(env, list.player, ctx.capturedAt)
      : null;

    // Extracted list text is a source of truth for reprocessing; key by hash so
    // re-runs overwrite identical content rather than duplicating it.
    const rawTextKey = `text/${list.contentHash}.txt`;
    await env.RAW.put(rawTextKey, list.listText, {
      httpMetadata: { contentType: "text/plain" },
    });

    const existing = await env.DB.prepare(
      "SELECT id, parser_version FROM lists WHERE content_hash = ?",
    )
      .bind(list.contentHash)
      .first<{ id: string; parser_version: string }>();

    let listId: string;
    let derive: boolean;
    if (!existing) {
      listId = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO lists (id, event_id, player_id, faction_id, detachment_ids, battle_size, points, share_token, content_hash, raw_text_r2_key, import_format, parser_version, first_submission_id, captured_at, placing, wins, losses, draws)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          listId,
          eventId,
          playerId,
          list.factionId,
          JSON.stringify(list.detachmentIds),
          list.battleSize,
          list.points,
          list.shareToken,
          list.contentHash,
          rawTextKey,
          list.importFormat,
          list.parserVersion,
          ctx.submissionId,
          ctx.capturedAt,
          list.placement.placing,
          list.placement.wins,
          list.placement.losses,
          list.placement.draws,
        )
        .run();
      newLists += 1;
      derive = true;
    } else {
      listId = existing.id;
      // Re-derive only when the parser changed (reprocessing).
      derive = existing.parser_version !== list.parserVersion;
      if (derive) {
        await env.DB.prepare(
          `UPDATE lists SET event_id = COALESCE(?, event_id), player_id = COALESCE(?, player_id), faction_id = ?, detachment_ids = ?, battle_size = ?, points = ?, share_token = ?, import_format = ?, parser_version = ?, raw_text_r2_key = ?, placing = ?, wins = ?, losses = ?, draws = ? WHERE id = ?`,
        )
          .bind(
            eventId,
            playerId,
            list.factionId,
            JSON.stringify(list.detachmentIds),
            list.battleSize,
            list.points,
            list.shareToken,
            list.importFormat,
            list.parserVersion,
            rawTextKey,
            list.placement.placing,
            list.placement.wins,
            list.placement.losses,
            list.placement.draws,
            listId,
          )
          .run();
      }
    }

    if (derive) await writeUnitsAndCoverage(env, listId, list, ctx.capturedAt);

    await env.DB.prepare(
      "INSERT OR IGNORE INTO list_sources (list_id, submission_id) VALUES (?, ?)",
    )
      .bind(listId, ctx.submissionId)
      .run();

    units += list.units.length;
    resolvedUnits += list.units.filter((u) => u.resolved).length;
  }

  return { lists: plan.lists.length, newLists, units, resolvedUnits };
}

/** Convenience: project a live submission envelope in one call. */
export async function projectSubmission(
  env: ProjectionEnv,
  envelope: SubmissionEnvelope,
  ctx: { submissionId: string; capturedAt: number },
): Promise<ProjectionSummary> {
  const plan = await planProjection(envelope);
  return applyProjection(env, plan, ctx);
}

/** Re-derive D1 rows for a submission from its retained raw payload in R2. */
export async function reprocessSubmission(
  env: ProjectionEnv,
  submissionId: string,
): Promise<ProjectionSummary> {
  const sub = await env.DB.prepare(
    "SELECT raw_r2_key, received_at FROM submissions WHERE id = ?",
  )
    .bind(submissionId)
    .first<{ raw_r2_key: string; received_at: number }>();
  if (!sub) throw new Error(`unknown submission ${submissionId}`);

  const object = await env.RAW.get(sub.raw_r2_key);
  if (!object) throw new Error(`missing raw object ${sub.raw_r2_key}`);
  const raw = await object.json<unknown>();

  const plan = await planProjection({ raw });
  return applyProjection(env, plan, {
    submissionId,
    capturedAt: sub.received_at,
  });
}
