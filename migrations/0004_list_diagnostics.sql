-- 0004_list_diagnostics.sql: surface what the importer already knows instead of
-- discarding it. Reported and computed totals stay distinct (never reconciled),
-- and the importer's warnings (points-mismatch, unresolved names, ...) ride on
-- the list row as JSON so the API and UI can label uncertainty honestly.
--
-- All four columns are re-derivable on reprocess; rows written by an older
-- parser_version hold NULL until reprocessed.
ALTER TABLE lists ADD COLUMN points_reported INTEGER;
ALTER TABLE lists ADD COLUMN points_computed INTEGER;
ALTER TABLE lists ADD COLUMN declared_limit  INTEGER;
ALTER TABLE lists ADD COLUMN warnings        TEXT;

-- Why the projection of a submission failed, when it did (NULL = projected
-- fine). Set on ingest/reprocess so moderation can see failed parses without
-- log-diving.
ALTER TABLE submissions ADD COLUMN projection_error TEXT;
