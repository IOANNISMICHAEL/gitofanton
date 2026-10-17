-- Embedding classifier (pipeline/src/classify.ts): which classifier version set a stored category.
-- NULL = set by keyword rules (or never classified): the discovery job (re)classifies these.
ALTER TABLE tools ADD COLUMN category_v INTEGER;
ALTER TABLE repos ADD COLUMN category_v INTEGER;
-- When a tool row last changed, so the data job can read only what changed since its last run.
ALTER TABLE tools ADD COLUMN changed_at TEXT;
UPDATE tools SET changed_at = COALESCE(first_seen, '2026-10-17T00:00:00Z');
