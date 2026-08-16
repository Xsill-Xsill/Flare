import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { chunks, claims, itemTags, items, workspaces } from '@/lib/db/schema'

const SOURCE_PREVIEW_LENGTH = 500

async function getOwnedItem(itemId: string, userId: string) {
  const [row] = await db
    .select({
      id: items.id,
      workspaceId: items.workspaceId,
      type: items.type,
      rawContent: items.rawContent,
      sourceUrl: items.sourceUrl,
      status: items.status,
      folder: items.folder,
      hideFromAi: items.hideFromAi,
      createdAt: items.createdAt,
    })
    .from(items)
    .innerJoin(workspaces, eq(workspaces.id, items.workspaceId))
    .where(and(eq(items.id, itemId), eq(workspaces.ownerId, userId)))
    .limit(1)

  return row ?? null
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await getOwnedItem(id, user.id)
  if (!item) return NextResponse.json({ error: 'item not found' }, { status: 404 })

  const [itemClaims, itemTagRows, itemChunks] = await Promise.all([
    db.select({ id: claims.id, statement: claims.statement, createdAt: claims.createdAt })
      .from(claims)
      .where(eq(claims.itemId, id)),
    db.select({ tag: itemTags.tag }).from(itemTags).where(eq(itemTags.itemId, id)),
    db.select({ content: chunks.content }).from(chunks).where(eq(chunks.itemId, id)).orderBy(chunks.createdAt),
  ])

  const sourceText = item.rawContent ?? itemChunks.map((c) => c.content).join('\n')
  const sourcePreview = sourceText.length > SOURCE_PREVIEW_LENGTH
    ? `${sourceText.slice(0, SOURCE_PREVIEW_LENGTH)}…`
    : sourceText

  return NextResponse.json({
    id: item.id,
    type: item.type,
    rawContent: item.rawContent,
    sourceUrl: item.sourceUrl,
    status: item.status,
    folder: item.folder,
    hideFromAi: item.hideFromAi,
    createdAt: item.createdAt.toISOString(),
    claims: itemClaims.map((c) => ({ id: c.id, statement: c.statement, createdAt: c.createdAt.toISOString() })),
    tags: itemTagRows.map((t) => t.tag),
    sourcePreview,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await getOwnedItem(id, user.id)
  if (!item) return NextResponse.json({ error: 'item not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  const { folder, tags } = body as { folder?: string | null; tags?: string[] }

  if (folder !== undefined && folder !== null && typeof folder !== 'string') {
    return NextResponse.json({ error: 'folder must be a string or null' }, { status: 400 })
  }
  if (tags !== undefined && (!Array.isArray(tags) || !tags.every((t) => typeof t === 'string'))) {
    return NextResponse.json({ error: 'tags must be an array of strings' }, { status: 400 })
  }

  await db.transaction(async (tx) => {
    if (folder !== undefined) {
      await tx.update(items).set({ folder: folder?.trim() || null }).where(eq(items.id, id))
    }

    if (tags !== undefined) {
      const cleanTags = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)))
      await tx.delete(itemTags).where(eq(itemTags.itemId, id))
      if (cleanTags.length > 0) {
        await tx.insert(itemTags).values(cleanTags.map((tag) => ({ itemId: id, tag, userId: user.id })))
      }
    }
  })

  const updated = await getOwnedItem(id, user.id)
  const updatedTags = await db.select({ tag: itemTags.tag }).from(itemTags).where(eq(itemTags.itemId, id))

  return NextResponse.json({
    id: updated!.id,
    folder: updated!.folder,
    tags: updatedTags.map((t) => t.tag),
  })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await getOwnedItem(id, user.id)
  if (!item) return NextResponse.json({ error: 'item not found' }, { status: 404 })

  await db.transaction(async (tx) => {
    // item_tags cascades via FK; claims/chunks predate that constraint, so delete explicitly.
    await tx.delete(claims).where(eq(claims.itemId, id))
    await tx.delete(chunks).where(eq(chunks.itemId, id))
    await tx.delete(itemTags).where(eq(itemTags.itemId, id))
    await tx.delete(items).where(eq(items.id, id))
  })

  return NextResponse.json({ ok: true })
}
