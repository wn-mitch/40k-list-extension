-- 0001_init.sql: 40kdc-meta initial schema (Phase 0).
--
-- The raw BCP payload + extracted list text in R2 are the source of truth.
-- Everything below is a REBUILDABLE PROJECTION: when the parser improves, the
-- reprocessing job re-derives lists/list_units from the retained raw text and
-- bumps parser_version. Nothing here is authoritative on its own.

PRAGMA foreign_keys = ON;

-- Anonymous, stable per-install identity. Attributes a submission to a SOURCE,
-- not a person. `blocked` is the anti-abuse kill switch.
CREATE TABLE submitters (
  id               TEXT PRIMARY KEY,           -- public, anonymous per-install id
  install_key_hash TEXT NOT NULL,              -- hash of the install key
  first_seen       INTEGER NOT NULL,           -- ms epoch
  blocked          INTEGER NOT NULL DEFAULT 0, -- 0/1
  blocked_reason   TEXT
);
CREATE UNIQUE INDEX idx_submitters_install_key ON submitters (install_key_hash);

-- Every captured payload. Lands as 'pending' and is only promoted to 'accepted'
-- after curing (validity + parse + corroboration). The public query layer reads
-- ONLY accepted rows; 'quarantined'/'rejected' are retained for forensics.
CREATE TABLE submissions (
  id           TEXT PRIMARY KEY,
  submitter_id TEXT NOT NULL REFERENCES submitters (id),
  raw_r2_key   TEXT NOT NULL,                  -- immutable raw BCP JSON + list text
  payload_hash TEXT NOT NULL,                  -- per-submitter idempotency
  received_at  INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'quarantined', 'rejected'))
);
CREATE UNIQUE INDEX idx_submissions_dedup ON submissions (submitter_id, payload_hash);
CREATE INDEX idx_submissions_status ON submissions (status);

CREATE TABLE events (
  id           TEXT PRIMARY KEY,
  bcp_event_id TEXT NOT NULL,
  name         TEXT,
  date         TEXT,
  format       TEXT,
  region       TEXT,
  captured_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_events_bcp ON events (bcp_event_id);

-- Consent is modelled as a JOIN target (a list references a player), never baked
-- into list rows, so the consent policy can change without reprocessing R2, and
-- opt-out is a purge of identity columns here.
CREATE TABLE players (
  id                 TEXT PRIMARY KEY,
  bcp_player_id_hash TEXT NOT NULL,
  display_name       TEXT,                     -- populated only for opted_in
  consent            TEXT NOT NULL DEFAULT 'unknown'
    CHECK (consent IN ('opted_in', 'excluded', 'unknown')),
  updated_at         INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_players_hash ON players (bcp_player_id_hash);

CREATE TABLE lists (
  id                  TEXT PRIMARY KEY,
  event_id            TEXT REFERENCES events (id),
  player_id           TEXT REFERENCES players (id),
  faction_id          TEXT,
  detachment_ids      TEXT NOT NULL DEFAULT '[]', -- JSON array of 40kdc entity ids
  battle_size         TEXT,
  points              INTEGER,
  share_token         TEXT,                       -- when encodable; portable list id
  content_hash        TEXT NOT NULL,              -- sha256 of normalized list text; dedup key
  raw_text_r2_key     TEXT NOT NULL,              -- source of truth for reprocessing
  import_format       TEXT,                       -- detected format (gw/wtc/listforge/...)
  parser_version      TEXT NOT NULL,
  first_submission_id TEXT REFERENCES submissions (id),
  captured_at         INTEGER NOT NULL
);
-- content_hash is the dedup key (not share_token): unresolved lists may not be
-- encodable, but every list has normalized text. Two captures of the same list
-- collapse onto one row; list_sources records all submitters that sent it.
CREATE UNIQUE INDEX idx_lists_content_hash ON lists (content_hash);
CREATE INDEX idx_lists_event ON lists (event_id);
CREATE INDEX idx_lists_faction ON lists (faction_id);
CREATE INDEX idx_lists_share ON lists (share_token);

-- Many submitters -> one list. Corroboration count + reconciliation trail.
CREATE TABLE list_sources (
  list_id       TEXT NOT NULL REFERENCES lists (id),
  submission_id TEXT NOT NULL REFERENCES submissions (id),
  PRIMARY KEY (list_id, submission_id)
);

CREATE TABLE list_units (
  id             TEXT PRIMARY KEY,
  list_id        TEXT NOT NULL REFERENCES lists (id),
  unit_id        TEXT,                          -- 40kdc entity id; NULL if unresolved
  raw_name       TEXT NOT NULL,                 -- preserved for coverage + re-resolution
  model_count    INTEGER NOT NULL DEFAULT 1,
  is_warlord     INTEGER NOT NULL DEFAULT 0,
  enhancement_id TEXT,
  resolved       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_list_units_list ON list_units (list_id);
CREATE INDEX idx_list_units_unit ON list_units (unit_id);

-- Import-fidelity log: how many units resolved, per format + parser version.
-- Reprocessing should show unresolved_units trending down over time.
CREATE TABLE coverage (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at      INTEGER NOT NULL,
  format           TEXT,
  parser_version   TEXT NOT NULL,
  unresolved_units INTEGER NOT NULL,
  total_units      INTEGER NOT NULL
);
