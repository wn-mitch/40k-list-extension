-- 0002_api_usage.sql: per-owner daily quota for the /v1 query API.
--
-- A cheap cost lever: every authenticated query bumps (owner, UTC-day) and is
-- rejected with 429 once it exceeds MAX_QUERIES_PER_DAY. Doubles as usage
-- analytics. If per-request writes ever become a hotspot, swap to the Workers
-- rate-limit binding and keep this table for analytics.
CREATE TABLE api_usage (
  owner TEXT NOT NULL,
  day   TEXT NOT NULL,                 -- UTC YYYY-MM-DD
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner, day)
);
