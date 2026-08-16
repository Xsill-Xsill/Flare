import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { itemTags, items, workspaces } from '@/lib/db/schema'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
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
    .selectDistinct({ tag: itemTags.tag })
    .from(itemTags)
    .innerJoin(items, eq(items.id, itemTags.itemId))
    .where(and(eq(items.workspaceId, workspaceId), eq(itemTags.userId, user.id)))
    .orderBy(itemTags.tag)

  return NextResponse.json(rows.map((r) => r.tag))
}
