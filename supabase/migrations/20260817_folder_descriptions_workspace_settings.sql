-- AI-facing description on folders + per-workspace notification/insight preferences.

ALTER TABLE folders ADD COLUMN IF NOT EXISTS description text;

CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  digest_enabled boolean NOT NULL DEFAULT true,
  notify_new_insight boolean NOT NULL DEFAULT true,
  notify_processing_done boolean NOT NULL DEFAULT false,
  insights_instructions text,
  insights_schedule text NOT NULL DEFAULT 'daily'
    CHECK (insights_schedule IN ('daily', 'weekly', 'threshold'))
);

ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_workspace_settings" ON workspace_settings
  FOR ALL USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()::text
    )
  );
