/**
 * BCP list capture -> normalized 40kdc list.
 *
 * The heavy lifting is delegated to `@alpaca-software/40kdc-data`: `tryImportRoster`
 * auto-detects the army-builder format the player pasted into BCP and resolves
 * unit/faction names to 40kdc entity IDs. We add the BCP-specific glue: a stable
 * content hash for dedup, a portable share token when encodable, and the flat
 * row shapes the ingestion/admin layers persist.
 */
import {
  tryImportRoster,
  rosterToShareList,
  encodeShareToken,
  type Roster,
} from "@alpaca-software/40kdc-data";
import type { BcpListCapture } from "@40kdc-meta/shared";

/**
 * Bump whenever parsing or normalization changes meaning. Stamped onto every
 * list + coverage row so reprocessing can re-derive rows and track fidelity per
 * version.
 */
export const PARSER_VERSION = "p0-2026.06.28";

export interface NormalizedUnit {
  unit_id: string | null;
  raw_name: string;
  model_count: number;
  is_warlord: boolean;
  enhancement_id: string | null;
  resolved: boolean;
}

export interface NormalizedList {
  /** False when the pasted text matched no known army-builder format. */
  ok: boolean;
  /** Detected source format (e.g. "newrecruit-simple"), or null on failure. */
  format: string | null;
  faction_id: string | null;
  detachment_ids: string[];
  battle_size: string | null;
  points: number | null;
  /** Compact registry-indexed token; null when the list isn't encodable. */
  share_token: string | null;
  /** sha256 of the normalized list text — the dedup key. Always present. */
  content_hash: string;
  units: NormalizedUnit[];
  resolved_units: number;
  total_units: number;
  parser_version: string;
  /** The full resolved roster, for callers that need richer detail. */
  roster: Roster | null;
}

/** Normalize one captured list. Pure + deterministic given the same input. */
export async function normalizeList(capture: BcpListCapture): Promise<NormalizedList> {
  const content_hash = await sha256Hex(normalizeText(capture.listText));

  const result = tryImportRoster(capture.listText);
  if (!result.ok) {
    return {
      ok: false,
      format: null,
      faction_id: null,
      detachment_ids: [],
      battle_size: null,
      points: null,
      share_token: null,
      content_hash,
      units: [],
      resolved_units: 0,
      total_units: 0,
      parser_version: PARSER_VERSION,
      roster: null,
    };
  }

  const roster = result.roster;

  // Portable share token is best-effort: encoding throws if the registry lacks
  // an id, so unresolved/exotic lists simply get a null token (content_hash
  // still dedups them).
  let share_token: string | null = null;
  try {
    share_token = encodeShareToken(rosterToShareList(roster));
  } catch {
    share_token = null;
  }

  const units: NormalizedUnit[] = roster.units.map((u) => ({
    unit_id: u.ref.id,
    raw_name: u.ref.raw_name,
    model_count: u.model_count,
    is_warlord: u.is_warlord,
    enhancement_id: u.enhancement?.id ?? null,
    resolved: u.ref.resolved,
  }));

  return {
    ok: true,
    format: result.format,
    faction_id: roster.faction_id,
    detachment_ids: roster.detachments.map((d) => d.ref.id).filter((id): id is string => id != null),
    battle_size: roster.battle_size,
    points: roster.points.total_reported ?? roster.points.total_computed ?? null,
    share_token,
    content_hash,
    units,
    resolved_units: roster.diagnostics.resolved_units,
    total_units: roster.diagnostics.resolved_units + roster.diagnostics.unresolved_units,
    parser_version: PARSER_VERSION,
    roster,
  };
}

/** Whitespace-normalize the pasted text so trivial reformatting dedups equal. */
function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim().replace(/[ \t]+\n/g, "\n");
}

/** SHA-256 hex via Web Crypto — available in both Workers and Node 18+. */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
