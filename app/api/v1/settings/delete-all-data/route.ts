import { NextRequest, NextResponse } from 'next/server'
import { and, eq, inArray } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { chunks, claimEntities, claims, entities, folders, insights, itemTags, items, workspaces } from '@/lib/db/schema'
import { DEFAULT_FOLDERS } from '@/lib/vault/default-folders'

const CONFIRMATION_TOKEN = 'DELETE'

// Wipes everything a workspace holds — notes, sources, insights, folders — but keeps the
// workspace row and its workspace_settings row intact, unlike DELETE /api/v1/workspaces/[id]
// which removes the workspace itself. Same "type DELETE to confirm" pattern, but enforced
// here server-side too (that route only checks it client-side via window.prompt).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : ''
  const confirm = typeof body?.confirm === 'string' ? body.confirm : ''

  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
  }
  if (confirm !== CONFIRMATION_TOKEN) {
    return NextResponse.json({ error: `Type ${CONFIRMATION_TOKEN} to confirm` }, { status: 400 })
  }

  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, user.id)))
    .limit(1)

  if (!workspace) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })

  await db.transaction(async (tx) => {
    const workspaceItems = await tx.select({ id: items.id }).from(items).where(eq(items.workspaceId, workspaceId))
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

    await tx.delete(entities).where(eq(entities.workspaceId, workspaceId))
    await tx.delete(insights).where(eq(insights.workspaceId, workspaceId))
    await tx.delete(folders).where(eq(folders.workspaceId, workspaceId))

    // Re-seed the base folder set so the workspace lands back in the same state a brand new
    // workspace starts in, rather than one with zero folders at all.
    await tx.insert(folders).values(DEFAULT_FOLDERS.map((name) => ({ workspaceId, name, isDefault: true })))
  })

  return NextResponse.json({ ok: true })
}
