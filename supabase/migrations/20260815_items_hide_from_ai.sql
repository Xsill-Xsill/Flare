-- "Hide from AI" — заметки с этим флагом никогда не попадают в chunks/embeddings/claims
-- и не триггерят детекторы (см. lib/inngest/functions/ingest-item.ts).

ALTER TABLE items ADD COLUMN IF NOT EXISTS hide_from_ai boolean NOT NULL DEFAULT false;
