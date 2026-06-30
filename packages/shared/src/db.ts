/**
 * D1 row types — kept in lockstep with `migrations/0001_init.sql`.
 *
 * Integer booleans (`0 | 1`) mirror SQLite's lack of a boolean type. These rows
 * are a rebuildable projection of the raw text retained in R2.
 */

/** Whether a player's identity may be shown publicly. */
export type Consent = "opted_in" | "excluded" | "unknown";

/** Lifecycle of a captured submission. Lists are `accepted` (public) on capture;
 *  moderation is reactive — `quarantined`/`rejected` hides it, `pending` is unused
 *  on ingest but kept for a possible future hold. */
export type SubmissionStatus = "pending" | "accepted" | "quarantined" | "rejected";

export interface SubmitterRow {
  id: string;
  install_key_hash: string;
  first_seen: number;
  blocked: 0 | 1;
  blocked_reason: string | null;
}

export interface SubmissionRow {
  id: string;
  submitter_id: string;
  raw_r2_key: string;
  payload_hash: string;
  received_at: number;
  status: SubmissionStatus;
}

export interface EventRow {
  id: string;
  bcp_event_id: string;
  name: string | null;
  date: string | null;
  format: string | null;
  region: string | null;
  captured_at: number;
}

export interface PlayerRow {
  id: string;
  bcp_player_id_hash: string;
  display_name: string | null;
  consent: Consent;
  updated_at: number;
}

export interface ListRow {
  id: string;
  event_id: string | null;
  player_id: string | null;
  faction_id: string | null;
  /** JSON-encoded array of 40kdc detachment entity ids. */
  detachment_ids: string;
  battle_size: string | null;
  points: number | null;
  share_token: string | null;
  content_hash: string;
  raw_text_r2_key: string;
  import_format: string | null;
  parser_version: string;
  first_submission_id: string | null;
  captured_at: number;
}

export interface ListSourceRow {
  list_id: string;
  submission_id: string;
}

export interface ListUnitRow {
  id: string;
  list_id: string;
  unit_id: string | null;
  raw_name: string;
  model_count: number;
  is_warlord: 0 | 1;
  enhancement_id: string | null;
  resolved: 0 | 1;
}

export interface CoverageRow {
  id?: number;
  captured_at: number;
  format: string | null;
  parser_version: string;
  unresolved_units: number;
  total_units: number;
}
