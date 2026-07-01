/**
 * BCP capture shapes.
 *
 * {@link SubmissionEnvelope} (what the extension POSTs to ingestion) is the firm
 * contract. The BCP *response* shapes below were pinned from a live,
 * authenticated BCP session during the Phase 1b capture spike; the API lives at
 * `newprod-api.bestcoastpairings.com/v1/*`. Only the fields this project uses are
 * typed; unmodelled fields are tolerated via index signatures and retained
 * verbatim in `raw`, so BCP adding fields never breaks ingestion.
 */

// ---------------------------------------------------------------------------
// Pinned BCP API responses (`newprod-api.bestcoastpairings.com/v1/*`)
// ---------------------------------------------------------------------------

/** `/v1/...` collection responses are cursor-paginated. */
export interface BcpPaginated<T> {
  data: T[];
  /** Opaque cursor for the next page, or null/absent on the last page. */
  nextKey: string | null;
}

/** A faction / army / team / detachment reference: `{ id, name }`. */
export interface BcpNamedRef {
  id: string;
  name: string;
}

/** Per-player standings (subset of BCP's much larger `metrics` block). */
export interface BcpPlayerMetrics {
  placing?: number | null;
  wins?: number | null;
  losses?: number | null;
  draws?: number | null;
  battlePoints?: number | null;
  record?: string | null;
  [key: string]: unknown;
}

/** A player embedded in an army list (`/v1/armylists/:id` → `player`). */
export interface BcpListPlayer {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  faction?: BcpNamedRef | null;
  army?: BcpNamedRef | null;
  team?: BcpNamedRef | null;
  metrics?: BcpPlayerMetrics | null;
  [key: string]: unknown;
}

/** Event metadata embedded in an army list (`/v1/armylists/:id` → `event`). */
export interface BcpListEvent {
  id: string;
  name?: string | null;
  eventDate?: string | null; // ISO
  eventEndDate?: string | null; // ISO
  isOnlineEvent?: boolean | null;
  [key: string]: unknown;
}

/**
 * `GET /v1/armylists/:armyListId`: the army list a player submitted. The
 * primary object the normalizer consumes: `armyListText` is the pasted list.
 */
export interface BcpArmyListResponse {
  id: string;
  /** The army-list text the player pasted: the thing we normalize. */
  armyListText: string;
  armyListHTML?: string | null;
  listType?: string | null; // e.g. "text"
  listStatus?: string | null; // e.g. "passed"
  archived?: boolean;
  /** Game-specific block; for 40k it carries the detachment name. */
  warhammer?: { detachment?: string | null; [key: string]: unknown } | null;
  event?: BcpListEvent | null;
  player?: BcpListPlayer | null;
  eventId?: string | null;
  playerId?: string | null;
  gameSystemId?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

/** A player row from `GET /v1/events/:eventId/players` (and `/teamplayers`). */
export interface BcpEventPlayer {
  id: string;
  eventId?: string | null;
  userId?: string | null;
  user?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    [key: string]: unknown;
  } | null;
  faction?: BcpNamedRef | null;
  factionId?: string | null;
  team?: BcpNamedRef | null;
  teamId?: string | null;
  /** The player's army list id + public URL, when present. */
  listId?: string | null;
  listUrl?: string | null;
  dropped?: boolean;
  checkedIn?: boolean;
  [key: string]: unknown;
}

/** `GET /v1/events/:eventId/players` and `.../teamplayers`. */
export interface BcpEventPlayersResponse {
  active: BcpEventPlayer[];
  deleted: BcpEventPlayer[];
}

// ---------------------------------------------------------------------------
// Normalizer extraction targets
//
// The flattened, project-internal view a captured response is mapped into.
// (Phase 3 maps a {@link BcpArmyListResponse} → {@link BcpListCapture}; the
// extension itself still forwards responses raw for v1.)
// ---------------------------------------------------------------------------

/** One army list, flattened for the normalizer. */
export interface BcpListCapture {
  /** BCP event id the list belongs to. */
  eventId: string;
  /** BCP player id (raw; hashed before it is ever persisted). */
  playerId: string | null;
  /** Display name as shown on BCP (persisted only with consent). */
  playerName: string | null;
  /** The army-list text the player pasted into BCP (BCP `armyListText`). */
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
  date: string | null; // ISO
  format: string | null;
  region: string | null;
}

/** A player's standing in an event (from BCP `player.metrics`). */
export interface BcpPlacement {
  rank: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
}

// ---------------------------------------------------------------------------
// Ingestion contract
// ---------------------------------------------------------------------------

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
  /** Stable, anonymous per-install id; identifies the source, not the person. */
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
