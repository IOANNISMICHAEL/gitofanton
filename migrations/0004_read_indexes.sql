-- D1 free tier: 5M rows read/day. The data job reads only rows changed since its last run; without
-- these indexes each of those reads scanned the whole table (2026-10-18: daily read limit hit).
CREATE INDEX IF NOT EXISTS repos_enriched_at ON repos(enriched_at);
CREATE INDEX IF NOT EXISTS tools_changed_at ON tools(changed_at);
