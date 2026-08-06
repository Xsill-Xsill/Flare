import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  vector,
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const chunks = pgTable('chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  itemId: uuid('item_id').references(() => items.id).notNull(),
  content: text('content').notNull(),
  tokenCount: integer('token_count'),
  embedding: vector('embedding', { dimensions: 1024 }),
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
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
