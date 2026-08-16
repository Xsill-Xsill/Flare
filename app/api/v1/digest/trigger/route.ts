import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { workspaces } from '@/lib/db/schema'
import { sendDigestForWorkspace } from '@/lib/insights/digest'

// Manual test hook for the daily digest — bypasses the cron schedule. Not surfaced in the
// UI; intended for curl/Postman while iterating on the email template and detectors.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const requestedWorkspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : null

  const [workspace] = requestedWorkspaceId
    ? await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.id, requestedWorkspaceId), eq(workspaces.ownerId, user.id)))
        .limit(1)
    : await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.ownerId, user.id)).limit(1)

  if (!workspace) {
    return NextResponse.json({ error: 'workspace not found' }, { status: 404 })
  }

  const result = await sendDigestForWorkspace(workspace.id)

  return NextResponse.json({ sent: result.sent, insightsCount: result.insightsCount })
}
