-- Убираем дублирующиеся policy, раздельные по командам (SELECT/INSERT/UPDATE/DELETE),
-- которые повторяют ту же owner-логику, что уже покрыта единой policy "owner_*" (FOR ALL)
-- из 20260805_rls.sql. Держать оба набора избыточно — на каждый запрос дважды
-- выполняется один и тот же sub-select через workspaces.

DROP POLICY IF EXISTS "chunks_delete" ON chunks;
DROP POLICY IF EXISTS "chunks_insert" ON chunks;
DROP POLICY IF EXISTS "chunks_select" ON chunks;
DROP POLICY IF EXISTS "chunks_update" ON chunks;

DROP POLICY IF EXISTS "claim_entities_delete" ON claim_entities;
DROP POLICY IF EXISTS "claim_entities_insert" ON claim_entities;
DROP POLICY IF EXISTS "claim_entities_select" ON claim_entities;

DROP POLICY IF EXISTS "claims_delete" ON claims;
DROP POLICY IF EXISTS "claims_insert" ON claims;
DROP POLICY IF EXISTS "claims_select" ON claims;
DROP POLICY IF EXISTS "claims_update" ON claims;

DROP POLICY IF EXISTS "entities_delete" ON entities;
DROP POLICY IF EXISTS "entities_insert" ON entities;
DROP POLICY IF EXISTS "entities_select" ON entities;
DROP POLICY IF EXISTS "entities_update" ON entities;

DROP POLICY IF EXISTS "insights_delete" ON insights;
DROP POLICY IF EXISTS "insights_insert" ON insights;
DROP POLICY IF EXISTS "insights_select" ON insights;
DROP POLICY IF EXISTS "insights_update" ON insights;

DROP POLICY IF EXISTS "items_delete" ON items;
DROP POLICY IF EXISTS "items_insert" ON items;
DROP POLICY IF EXISTS "items_select" ON items;
DROP POLICY IF EXISTS "items_update" ON items;

DROP POLICY IF EXISTS "workspaces_delete" ON workspaces;
DROP POLICY IF EXISTS "workspaces_insert" ON workspaces;
DROP POLICY IF EXISTS "workspaces_select" ON workspaces;
DROP POLICY IF EXISTS "workspaces_update" ON workspaces;
