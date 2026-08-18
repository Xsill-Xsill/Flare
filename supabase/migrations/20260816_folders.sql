-- Folders становятся первоклассной сущностью (а не просто произвольной строкой на items),
-- чтобы у каждого workspace всегда были базовые папки (даже пустые) и чтобы позже можно
-- было добавить AI-facing description на папку без очередной болезненной миграции.

CREATE TABLE IF NOT EXISTS folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS folders_workspace_name_idx ON folders(workspace_id, name);

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_folders" ON folders
  FOR ALL USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()::text
    )
  );

-- Backfill: seed the 6 base folders for every workspace that already exists.
INSERT INTO folders (workspace_id, name, is_default)
SELECT w.id, f.name, true
FROM workspaces w
CROSS JOIN (VALUES ('Ideas'), ('Research'), ('Sources'), ('People & Customers'), ('Journal'), ('Tasks')) AS f(name)
ON CONFLICT (workspace_id, name) DO NOTHING;

-- Backfill: preserve any custom folder names already in use on items so they don't
-- disappear from the folder list now that it's sourced from this table.
INSERT INTO folders (workspace_id, name, is_default)
SELECT DISTINCT workspace_id, folder, false
FROM items
WHERE folder IS NOT NULL
ON CONFLICT (workspace_id, name) DO NOTHING;
