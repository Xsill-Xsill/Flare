import { NextRequest, NextResponse } from 'next/server'
import { and, asc, desc, eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { folders, workspaces } from '@/lib/db/schema'

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
    .select({ name: folders.name })
    .from(folders)
    .where(eq(folders.workspaceId, workspaceId))
    .orderBy(desc(folders.isDefault), asc(folders.name))

  return NextResponse.json(rows.map((r) => r.name))
}
