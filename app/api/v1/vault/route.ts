import { NextRequest, NextResponse } from 'next/server'
import { and, asc, cosineDistance, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { chunks, claims, itemTags, items, workspaces } from '@/lib/db/schema'
import { getEmbedding } from '@/lib/ingestion/embeddings'

type VaultItem = {
  id: string
  type: 'text' | 'url' | 'file' | 'audio'
  rawContent: string | null
  sourceUrl: string | null
  status: 'queued' | 'processing' | 'done' | 'failed'
  folder: string | null
  hideFromAi: boolean
  createdAt: string
  claims: string[]
  tags: string[]
}

const ITEM_TYPES = ['text', 'url', 'file', 'audio'] as const
const ITEM_STATUSES = ['queued', 'processing', 'done', 'failed'] as const

// Cosine distance threshold below which a chunk is considered a semantic match (0 = identical, 2 = opposite).
const SEMANTIC_DISTANCE_THRESHOLD = 0.4
const SEMANTIC_CHUNK_LIMIT = 20

function isItemType(value: string): value is VaultItem['type'] {
  return (ITEM_TYPES as readonly string[]).includes(value)
}

function isItemStatus(value: string): value is VaultItem['status'] {
  return (ITEM_STATUSES as readonly string[]).includes(value)
}

async function loadItemsByIds(itemIds: string[]): Promise<Map<string, VaultItem>> {
  if (itemIds.length === 0) return new Map()

  const rows = await db
    .select({
      itemId: items.id,
      type: items.type,
      rawContent: items.rawContent,
      sourceUrl: items.sourceUrl,
      status: items.status,
      folder: items.folder,
      hideFromAi: items.hideFromAi,
      createdAt: items.createdAt,
      claimStatement: claims.statement,
      tag: itemTags.tag,
    })
    .from(items)
    .leftJoin(chunks, eq(chunks.itemId, items.id))
    .leftJoin(claims, eq(claims.chunkId, chunks.id))
    .leftJoin(itemTags, eq(itemTags.itemId, items.id))
    .where(inArray(items.id, itemIds))

  const grouped = new Map<string, VaultItem>()
  for (const row of rows) {
    let item = grouped.get(row.itemId)
    if (!item) {
      if (!isItemType(row.type) || !isItemStatus(row.status)) continue
      item = {
        id: row.itemId,
        type: row.type,
        rawContent: row.rawContent,
        sourceUrl: row.sourceUrl,
        status: row.status,
        folder: row.folder,
        hideFromAi: row.hideFromAi,
        createdAt: row.createdAt.toISOString(),
        claims: [],
        tags: [],
      }
      grouped.set(row.itemId, item)
    }
    if (row.claimStatement && !item.claims.includes(row.claimStatement)) {
      item.claims.push(row.claimStatement)
    }
    if (row.tag && !item.tags.includes(row.tag)) {
      item.tags.push(row.tag)
    }
  }
  return grouped
}

/** Returns ordered, deduplicated item ids from a semantic (embedding) search, or null if the search could not run. */
async function trySemanticSearch(
  workspaceId: string,
  folder: string | null,
  query: string
): Promise<string[] | null> {
  let embedding: number[]
  try {
    embedding = await getEmbedding(query)
  } catch (err) {
    console.error('vault semantic search: embedding lookup failed, falling back to text search', err)
    return null
  }

  try {
    const distance = cosineDistance(chunks.embedding, embedding)
    const conditions = [
      eq(items.workspaceId, workspaceId),
      eq(items.status, 'done'),
      sql`${distance} < ${SEMANTIC_DISTANCE_THRESHOLD}`,
    ]
    if (folder) conditions.push(eq(items.folder, folder))

    const rows = await db
      .select({ itemId: chunks.itemId, distance })
      .from(chunks)
      .innerJoin(items, eq(items.id, chunks.itemId))
      .where(and(...conditions))
      .orderBy(asc(distance))
      .limit(SEMANTIC_CHUNK_LIMIT)

    const seen = new Set<string>()
    const orderedIds: string[] = []
    for (const row of rows) {
      if (!seen.has(row.itemId)) {
        seen.add(row.itemId)
        orderedIds.push(row.itemId)
      }
    }
    return orderedIds
  } catch (err) {
    console.error('vault semantic search: pgvector query failed, falling back to text search', err)
    return null
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const searchParams = req.nextUrl.searchParams
  const workspaceId = searchParams.get('workspaceId')
  const requestedLimit = Number(searchParams.get('limit'))
  const requestedOffset = Number(searchParams.get('offset'))
  const limit = Math.min(Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.floor(requestedLimit) : 20, 100)
  const offset = Number.isFinite(requestedOffset) && requestedOffset > 0 ? Math.floor(requestedOffset) : 0
  const q = searchParams.get('q')?.trim()
  const folder = searchParams.get('folder')?.trim() || null

  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
  }

  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, user.id)))
    .limit(1)

  if (!workspace) {
    return NextResponse.json({ error: 'workspace not found' }, { status: 404 })
  }

  // Semantic search mode: embed the query and rank by pgvector cosine distance.
  // Falls back to the ILIKE path below if there is no query, the embedding call fails,
  // or the vector query itself fails.
  if (q) {
    const semanticItemIds = await trySemanticSearch(workspaceId, folder, q)
    if (semanticItemIds !== null) {
      const itemsMap = await loadItemsByIds(semanticItemIds)
      const ordered = semanticItemIds
        .map((id) => itemsMap.get(id))
        .filter((item): item is VaultItem => Boolean(item))
        .slice(offset, offset + limit)
      return NextResponse.json(ordered)
    }
  }

  // Text search / listing fallback (ILIKE).
  const conditions = [eq(items.workspaceId, workspaceId)]
  if (folder) conditions.push(eq(items.folder, folder))
  if (q) {
    const pattern = `%${q}%`
    conditions.push(eq(items.status, 'done'))
    conditions.push(or(ilike(items.rawContent, pattern), ilike(items.sourceUrl, pattern), ilike(claims.statement, pattern))!)
  }

  // Select a distinct page of matching item IDs first, then join claims/tags for that
  // page. This keeps pagination item-based while still returning every claim/tag.
  const matchingItems = db.$with('matching_items').as(
    db
      .selectDistinct({ id: items.id, createdAt: items.createdAt })
      .from(items)
      .leftJoin(chunks, eq(chunks.itemId, items.id))
      .leftJoin(claims, eq(claims.chunkId, chunks.id))
      .where(and(...conditions))
      .orderBy(desc(items.createdAt), items.id)
      .limit(limit)
      .offset(offset)
  )

  const rows = await db
    .with(matchingItems)
    .select({
      itemId: items.id,
      type: items.type,
      rawContent: items.rawContent,
      sourceUrl: items.sourceUrl,
      status: items.status,
      folder: items.folder,
      hideFromAi: items.hideFromAi,
      createdAt: items.createdAt,
      claimStatement: claims.statement,
      tag: itemTags.tag,
    })
    .from(items)
    .innerJoin(matchingItems, eq(matchingItems.id, items.id))
    .leftJoin(chunks, eq(chunks.itemId, items.id))
    .leftJoin(claims, eq(claims.chunkId, chunks.id))
    .leftJoin(itemTags, eq(itemTags.itemId, items.id))
    .orderBy(desc(matchingItems.createdAt), matchingItems.id)

  const grouped = new Map<string, VaultItem>()
  for (const row of rows) {
    let item = grouped.get(row.itemId)
    if (!item) {
      if (!isItemType(row.type) || !isItemStatus(row.status)) continue
      item = {
        id: row.itemId,
        type: row.type,
        rawContent: row.rawContent,
        sourceUrl: row.sourceUrl,
        status: row.status,
        folder: row.folder,
        hideFromAi: row.hideFromAi,
        createdAt: row.createdAt.toISOString(),
        claims: [],
        tags: [],
      }
      grouped.set(row.itemId, item)
    }
    if (row.claimStatement && !item.claims.includes(row.claimStatement)) {
      item.claims.push(row.claimStatement)
    }
    if (row.tag && !item.tags.includes(row.tag)) {
      item.tags.push(row.tag)
    }
  }

  return NextResponse.json(Array.from(grouped.values()))
}
