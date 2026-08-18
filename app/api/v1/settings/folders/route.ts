import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { folders, workspaces } from '@/lib/db/schema'

const MAX_NAME_LENGTH = 50

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err) && typeof err === 'object' && (err as { code?: string }).code === '23505'
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : ''
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() || null : null

  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
  }
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: `name must be ${MAX_NAME_LENGTH} characters or fewer` }, { status: 400 })
  }

  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, user.id)))
    .limit(1)

  if (!workspace) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })

  try {
    const [folder] = await db
      .insert(folders)
      .values({ workspaceId, name, isDefault: false, description })
      .returning({ id: folders.id, name: folders.name, isDefault: folders.isDefault, description: folders.description })

    return NextResponse.json(folder, { status: 201 })
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: 'A folder with that name already exists' }, { status: 409 })
    }
    throw err
  }
}
