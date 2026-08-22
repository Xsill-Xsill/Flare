import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  vector,
  uniqueIndex,
  boolean,
} from 'drizzle-orm/pg-core'

export const itemTypeEnum = pgEnum('item_type', ['text', 'url', 'file', 'audio'])
export const itemStatusEnum = pgEnum('item_status', ['queued', 'processing', 'done', 'failed'])

export const workspaces = pgTable('workspaces', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const items = pgTable('items', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  type: itemTypeEnum('type').notNull(),
  rawContent: text('raw_content'),
  sourceUrl: text('source_url'),
  status: itemStatusEnum('status').default('queued').notNull(),
  folder: text('folder'),
  // When true, ingest-item.ts skips chunking/embeddings/claims/detectors entirely for this
  // item — the note is stored but never read by the AI pipeline.
  hideFromAi: boolean('hide_from_ai').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const folders = pgTable('folders', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  // Seeded base folders (Ideas, Research, Sources, People & Customers, Journal, Tasks) vs.
  // ones the user created — lets the UI protect the base set from accidental rename/delete.
  isDefault: boolean('is_default').default(false).notNull(),
  // AI-facing instructions for what belongs in this folder — read by the (future) daily
  // inbox-routing agent, not required for the folder to function.
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  workspaceNameUnique: uniqueIndex('folders_workspace_name_idx').on(table.workspaceId, table.name),
}))

export const workspaceSettings = pgTable('workspace_settings', {
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).primaryKey(),
  digestEnabled: boolean('digest_enabled').default(true).notNull(),
  notifyNewInsight: boolean('notify_new_insight').default(true).notNull(),
  notifyProcessingDone: boolean('notify_processing_done').default(false).notNull(),
  insightsInstructions: text('insights_instructions'),
  // Persisted, but not yet consumed — daily-digest.ts still runs a single global 08:00 UTC
  // cron for everyone regardless of this value.
  insightsSchedule: text('insights_schedule').default('daily').notNull(),
  insightsLanguage: text('insights_language').default('auto').notNull(),
  insightsScheduleDay: text('insights_schedule_day'),
})

export const chunks = pgTable('chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id').references(() => items.id).notNull(),
  content: text('content').notNull(),
  tokenCount: integer('token_count'),
  embedding: vector('embedding', { dimensions: 1024 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const itemTags = pgTable('item_tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id').references(() => items.id, { onDelete: 'cascade' }).notNull(),
  tag: text('tag').notNull(),
  userId: text('user_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const claims = pgTable('claims', {
  id: uuid('id').defaultRandom().primaryKey(),
  chunkId: uuid('chunk_id').references(() => chunks.id).notNull(),
  itemId: uuid('item_id').references(() => items.id).notNull(),
  statement: text('statement').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const entities = pgTable('entities', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const claimEntities = pgTable('claim_entities', {
  claimId: uuid('claim_id').references(() => claims.id).notNull(),
  entityId: uuid('entity_id').references(() => entities.id).notNull(),
})

export const insights = pgTable('insights', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  detectorType: text('detector_type').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  evidence: jsonb('evidence'),
  // sha256 of the normalized (lowercase, trimmed) title — a deterministic identifier for
  // the underlying pattern, used to dedupe re-detected insights regardless of copy changes.
  patternHash: text('pattern_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  workspacePatternHashUnique: uniqueIndex('insights_workspace_pattern_hash_idx').on(table.workspaceId, table.patternHash),
}))
