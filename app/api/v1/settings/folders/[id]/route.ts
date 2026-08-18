import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { folders, workspaces } from '@/lib/db/schema'

const MAX_NAME_LENGTH = 50

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err) && typeof err === 'object' && (err as { code?: string }).code === '23505'
}

async function getOwnedFolder(folderId: string, userId: string) {
  const [row] = await db
    .select({ id: folders.id, name: folders.name, isDefault: folders.isDefault, workspaceId: folders.workspaceId })
    .from(folders)
    .innerJoin(workspaces, eq(workspaces.id, folders.workspaceId))
    .where(and(eq(folders.id, folderId), eq(workspaces.ownerId, userId)))
    .limit(1)
  return row ?? null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const folder = await getOwnedFolder(id, user.id)
  if (!folder) return NextResponse.json({ error: 'folder not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || (body.name === undefined && body.description === undefined)) {
    return NextResponse.json({ error: 'name or description is required' }, { status: 400 })
  }

  const updates: { name?: string; description?: string | null } = {}

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (name.length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: `name must be ${MAX_NAME_LENGTH} characters or fewer` }, { status: 400 })
    }
    updates.name = name
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') {
      return NextResponse.json({ error: 'description must be a string or null' }, { status: 400 })
    }
    updates.description = typeof body.description === 'string' ? body.description.trim() || null : null
  }

  try {
    const [updated] = await db
      .update(folders)
      .set(updates)
      .where(eq(folders.id, id))
      .returning({ id: folders.id, name: folders.name, isDefault: folders.isDefault, description: folders.description })

    return NextResponse.json(updated)
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: 'A folder with that name already exists' }, { status: 409 })
    }
    throw err
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const folder = await getOwnedFolder(id, user.id)
  if (!folder) return NextResponse.json({ error: 'folder not found' }, { status: 404 })

  if (folder.isDefault) {
    return NextResponse.json({ error: "Default folders can't be deleted" }, { status: 400 })
  }

  await db.delete(folders).where(eq(folders.id, id))

  return NextResponse.json({ ok: true })
}
