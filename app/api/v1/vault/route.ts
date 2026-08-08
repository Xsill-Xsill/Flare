import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, ilike, or } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { chunks, claims, items, workspaces } from '@/lib/db/schema'

type VaultItem = {
  id: string
  type: 'text' | 'url' | 'file' | 'audio'
  rawContent: string | null
  sourceUrl: string | null
  status: 'queued' | 'processing' | 'done' | 'failed'
  createdAt: string
  claims: string[]
}

const ITEM_TYPES = ['text', 'url', 'file', 'audio'] as const
const ITEM_STATUSES = ['queued', 'processing', 'done', 'failed'] as const

function isItemType(value: string): value is VaultItem['type'] {
  return (ITEM_TYPES as readonly string[]).includes(value)
}

function isItemStatus(value: string): value is VaultItem['status'] {
  return (ITEM_STATUSES as readonly string[]).includes(value)
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

  const conditions = [eq(items.workspaceId, workspaceId)]
  if (q) {
    const pattern = `%${q}%`
    conditions.push(eq(items.status, 'done'))
    conditions.push(or(ilike(items.rawContent, pattern), ilike(items.sourceUrl, pattern), ilike(claims.statement, pattern))!)
  }

  // Select a distinct page of matching item IDs first, then join claims for that
  // page. This keeps pagination item-based while still returning every claim.
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
      createdAt: items.createdAt,
      claimStatement: claims.statement,
    })
    .from(items)
    .innerJoin(matchingItems, eq(matchingItems.id, items.id))
    .leftJoin(chunks, eq(chunks.itemId, items.id))
    .leftJoin(claims, eq(claims.chunkId, chunks.id))
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
        createdAt: row.createdAt.toISOString(),
        claims: [],
      }
      grouped.set(row.itemId, item)
    }
    if (row.claimStatement && !item.claims.includes(row.claimStatement)) {
      item.claims.push(row.claimStatement)
    }
  }

  return NextResponse.json(Array.from(grouped.values()))
}
