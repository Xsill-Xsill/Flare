-- Vault: папки и теги для items + индекс для семантического поиска по chunks.embedding

ALTER TABLE items ADD COLUMN IF NOT EXISTS folder text;

CREATE TABLE IF NOT EXISTS item_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag text NOT NULL,
  user_id text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS item_tags_item_id_idx ON item_tags(item_id);
CREATE INDEX IF NOT EXISTS item_tags_user_id_tag_idx ON item_tags(user_id, tag);
CREATE INDEX IF NOT EXISTS items_folder_idx ON items(folder);

-- Векторный индекс для cosine similarity поиска по chunks.embedding
CREATE INDEX IF NOT EXISTS chunks_embedding_cosine_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);

-- RLS
ALTER TABLE item_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_item_tags" ON item_tags
  FOR ALL USING (
    item_id IN (
      SELECT i.id FROM items i
      JOIN workspaces w ON w.id = i.workspace_id
      WHERE w.owner_id = auth.uid()::text
    )
  );
