-- 0003_list_placement.sql: each entry's standings, so the query API can rank
-- lists (best-in-faction = top placing per faction) and expose a list's record.
--
-- Standings ride on the list row: one normalized list = one player's entry.
-- Derived from the captured BCP `player.metrics`, re-derivable on reprocess.
ALTER TABLE lists ADD COLUMN placing INTEGER;
ALTER TABLE lists ADD COLUMN wins    INTEGER;
ALTER TABLE lists ADD COLUMN losses  INTEGER;
ALTER TABLE lists ADD COLUMN draws   INTEGER;
