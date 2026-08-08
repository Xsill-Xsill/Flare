import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { insights, workspaces } from '@/lib/db/schema'
import type { EvidenceRef } from '@/lib/insights/types'
import { createClient } from '@/lib/supabase/server'

function isEvidenceRef(value: unknown): value is EvidenceRef {
  if (!value || typeof value !== 'object') return false
  const evidence = value as Record<string, unknown>
  return typeof evidence.itemId === 'string' && typeof evidence.claimId === 'string' && typeof evidence.statement === 'string'
}

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
    .select()
    .from(insights)
    .where(eq(insights.workspaceId, workspaceId))
    .orderBy(desc(insights.createdAt))
    .limit(20)

  return NextResponse.json(
    rows.map((insight) => ({
      id: insight.id,
      detectorType: insight.detectorType,
      title: insight.title,
      summary: insight.summary,
      evidence: Array.isArray(insight.evidence) && insight.evidence.every(isEvidenceRef) ? insight.evidence : null,
      createdAt: insight.createdAt.toISOString(),
    }))
  )
}
