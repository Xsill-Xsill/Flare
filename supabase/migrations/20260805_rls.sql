-- Включить RLS на всех таблицах
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;

-- workspaces: владелец видит только свои
CREATE POLICY "owner_workspaces" ON workspaces
  FOR ALL USING (owner_id = auth.uid()::text);

-- items: через workspace владельца
CREATE POLICY "owner_items" ON items
  FOR ALL USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()::text
    )
  );

-- chunks, claims, entities, insights — аналогично через workspace
CREATE POLICY "owner_chunks" ON chunks
  FOR ALL USING (
    item_id IN (
      SELECT i.id FROM items i
      JOIN workspaces w ON w.id = i.workspace_id
      WHERE w.owner_id = auth.uid()::text
    )
  );

CREATE POLICY "owner_claims" ON claims
  FOR ALL USING (
    item_id IN (
      SELECT i.id FROM items i
      JOIN workspaces w ON w.id = i.workspace_id
      WHERE w.owner_id = auth.uid()::text
    )
  );

CREATE POLICY "owner_entities" ON entities
  FOR ALL USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()::text
    )
  );

CREATE POLICY "owner_insights" ON insights
  FOR ALL USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()::text
    )
  );

-- claim_entities — через claims
CREATE POLICY "owner_claim_entities" ON claim_entities
  FOR ALL USING (
    claim_id IN (
      SELECT c.id FROM claims c
      JOIN items i ON i.id = c.item_id
      JOIN workspaces w ON w.id = i.workspace_id
      WHERE w.owner_id = auth.uid()::text
    )
  );
