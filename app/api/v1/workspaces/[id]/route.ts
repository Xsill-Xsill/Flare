import { NextRequest, NextResponse } from 'next/server'
import { and, eq, inArray } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { chunks, claimEntities, claims, entities, insights, itemTags, items, workspaces } from '@/lib/db/schema'
import { ACTIVE_WORKSPACE_COOKIE, ACTIVE_WORKSPACE_COOKIE_OPTIONS } from '@/lib/workspace/cookie'

const MAX_NAME_LENGTH = 50

async function getOwnedWorkspace(id: string, userId: string) {
  const [row] = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(and(eq(workspaces.id, id), eq(workspaces.ownerId, userId)))
    .limit(1)
  return row ?? null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await getOwnedWorkspace(id, user.id)
  if (!workspace) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: `name must be ${MAX_NAME_LENGTH} characters or fewer` }, { status: 400 })
  }

  const [updated] = await db
    .update(workspaces)
    .set({ name })
    .where(eq(workspaces.id, id))
    .returning({ id: workspaces.id, name: workspaces.name })

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspace = await getOwnedWorkspace(id, user.id)
  if (!workspace) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })

  const ownedWorkspaces = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.ownerId, user.id))

  if (ownedWorkspaces.length <= 1) {
    return NextResponse.json({ error: "You can't delete your only workspace" }, { status: 400 })
  }

  await db.transaction(async (tx) => {
    const workspaceItems = await tx.select({ id: items.id }).from(items).where(eq(items.workspaceId, id))
    const itemIds = workspaceItems.map((row) => row.id)

    if (itemIds.length > 0) {
      const workspaceClaims = await tx.select({ id: claims.id }).from(claims).where(inArray(claims.itemId, itemIds))
      const claimIds = workspaceClaims.map((row) => row.id)
      if (claimIds.length > 0) {
        await tx.delete(claimEntities).where(inArray(claimEntities.claimId, claimIds))
      }
      await tx.delete(claims).where(inArray(claims.itemId, itemIds))
      await tx.delete(chunks).where(inArray(chunks.itemId, itemIds))
      // item_tags cascades via FK too, but deleted explicitly for safety if that migration
      // hasn't run yet in a given environment.
      await tx.delete(itemTags).where(inArray(itemTags.itemId, itemIds))
      await tx.delete(items).where(inArray(items.id, itemIds))
    }

    await tx.delete(entities).where(eq(entities.workspaceId, id))
    await tx.delete(insights).where(eq(insights.workspaceId, id))
    await tx.delete(workspaces).where(eq(workspaces.id, id))
  })

  const nextActive = ownedWorkspaces.find((w) => w.id !== id)!

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, nextActive.id, ACTIVE_WORKSPACE_COOKIE_OPTIONS)

  return NextResponse.json({ activeWorkspace: nextActive })
}
