import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { items, workspaces } from '@/lib/db/schema'
import { inngest } from '@/lib/inngest/client'

const ITEM_TYPES = ['text', 'url', 'file', 'audio'] as const
type ItemType = (typeof ITEM_TYPES)[number]

function isValidUrl(value: string) {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { workspaceId, type, rawContent, sourceUrl } = body ?? {}

  if (typeof workspaceId !== 'string' || !workspaceId) {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
  }
  if (!ITEM_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of ${ITEM_TYPES.join(', ')}` }, { status: 400 })
  }
  if (type === 'text' && (typeof rawContent !== 'string' || !rawContent.trim())) {
    return NextResponse.json({ error: 'rawContent is required for type=text' }, { status: 400 })
  }
  if (type === 'url' && (typeof sourceUrl !== 'string' || !isValidUrl(sourceUrl))) {
    return NextResponse.json({ error: 'sourceUrl must be a valid URL for type=url' }, { status: 400 })
  }

  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, user.id)))
    .limit(1)

  if (!workspace) {
    return NextResponse.json({ error: 'workspace not found' }, { status: 404 })
  }

  const [item] = await db
    .insert(items)
    .values({
      workspaceId,
      type: type as ItemType,
      rawContent: rawContent ?? null,
      sourceUrl: sourceUrl ?? null,
      status: 'queued',
    })
    .returning()

  await inngest.send({ name: 'item/created', data: { itemId: item.id } })

  return NextResponse.json(item, { status: 201 })
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const searchParams = req.nextUrl.searchParams
  const workspaceId = searchParams.get('workspaceId')
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 100)
  const offset = Number(searchParams.get('offset')) || 0

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

  const rows = await db
    .select()
    .from(items)
    .where(eq(items.workspaceId, workspaceId))
    .orderBy(desc(items.createdAt))
    .limit(limit)
    .offset(offset)

  return NextResponse.json(rows)
}
