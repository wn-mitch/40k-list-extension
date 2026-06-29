/**
 * Provisional BCP capture shapes.
 *
 * These are PLACEHOLDERS. BCP's real API response shapes are unknown until the
 * Phase 1 capture spike pins them from actual responses — so everything here is
 * deliberately loose and will be tightened against real payloads. The one firm
 * contract is {@link SubmissionEnvelope}: what the extension POSTs to ingestion.
 */

/** One army list as captured from BCP (the player pasted an army-builder export). */
export interface BcpListCapture {
  /** BCP event id the list belongs to. */
  eventId: string;
  /** BCP player id (raw; hashed before it is ever persisted). */
  playerId: string | null;
  /** Display name as shown on BCP (persisted only with consent). */
  playerName: string | null;
  /** The army-list text the player pasted into BCP. The thing we normalize. */
  listText: string;
  /** Placement / win-loss record if present on the captured page. */
  placement?: BcpPlacement | null;
  /** Captured-but-not-yet-modelled fields, retained verbatim. */
  extra?: Record<string, unknown>;
}

/** Event metadata captured alongside lists. */
export interface BcpEventCapture {
  eventId: string;
  name: string | null;
  date: string | null; // ISO; provisional
  format: string | null;
  region: string | null;
}

/** A player's standing in an event. */
export interface BcpPlacement {
  rank: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
}

/** One BCP API response observed by the extension, forwarded verbatim. */
export interface CapturedResponse {
  url: string;
  method: string;
  status: number;
  /** Parsed JSON body when the response was JSON; else the raw text. */
  body: unknown;
  /** Client capture time, ms epoch. */
  capturedAt: number;
}

/**
 * The ingestion contract: what the browser extension POSTs per capture.
 * `raw` is the untouched payload as received from BCP, retained verbatim in R2
 * as the source of truth for reprocessing.
 */
export interface SubmissionEnvelope {
  /** Stable, anonymous per-install id — identifies the source, not the person. */
  submitterId: string;
  /** Client-side capture time, ms epoch. */
  capturedAt: number;
  event?: BcpEventCapture;
  lists: BcpListCapture[];
  /** Opaque raw payload as received from BCP. */
  raw: unknown;
  /** Raw BCP responses observed this run, forwarded verbatim (v1 passthrough). */
  captures?: CapturedResponse[];
}
