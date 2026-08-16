-- Дедупликация инсайтов: детерминированный pattern_hash + уникальный индекс
-- по (workspace_id, pattern_hash), чтобы один и тот же паттерн не сохранялся
-- повторно под разным title.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE insights ADD COLUMN IF NOT EXISTS pattern_hash text;

-- Backfill для уже существующих строк: sha256 от нормализованного (lowercase, trim) title.
UPDATE insights
SET pattern_hash = encode(digest(lower(trim(title)), 'sha256'), 'hex')
WHERE pattern_hash IS NULL;

ALTER TABLE insights ALTER COLUMN pattern_hash SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS insights_workspace_pattern_hash_idx
  ON insights(workspace_id, pattern_hash);
