import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { insights, items, workspaces } from '@/lib/db/schema'
import { createAdminClient } from '@/lib/supabase/admin'
import { renderDigestEmail, type DigestInsight } from '@/lib/email/digest-template'
import { sendEmail } from '@/lib/email/resend'
import type { EvidenceRef } from '@/lib/insights/types'

const DIGEST_INSIGHT_LIMIT = 3
export const DIGEST_WINDOW_HOURS = 24

export type DigestResult = {
  sent: boolean
  insightsCount: number
  reason?: string
}

function isEvidenceRef(value: unknown): value is EvidenceRef {
  if (!value || typeof value !== 'object') return false
  const ref = value as Record<string, unknown>
  return typeof ref.itemId === 'string' && typeof ref.claimId === 'string' && typeof ref.statement === 'string'
}

function isEvidenceRefList(value: unknown): value is EvidenceRef[] {
  return Array.isArray(value) && value.every(isEvidenceRef)
}

function evidenceItemTitle(item: { rawContent: string | null; sourceUrl: string | null }): string {
  const text = item.sourceUrl ?? item.rawContent
  if (!text) return 'Untitled'
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

// windowHours defaults to the daily cadence (last 24h). A workspace on the "weekly" insights
// schedule gets called with 24*7 instead, so its digest actually covers the week since its
// last send rather than showing only whatever happened to land in the final 24h.
export async function sendDigestForWorkspace(workspaceId: string, windowHours: number = DIGEST_WINDOW_HOURS): Promise<DigestResult> {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1)
  if (!workspace) {
    return { sent: false, insightsCount: 0, reason: 'workspace not found' }
  }

  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000)

  const recentInsights = await db
    .select()
    .from(insights)
    .where(and(eq(insights.workspaceId, workspaceId), gte(insights.createdAt, since)))
    .orderBy(desc(insights.createdAt))
    .limit(DIGEST_INSIGHT_LIMIT)

  if (recentInsights.length === 0) {
    return { sent: false, insightsCount: 0, reason: `no insights in the last ${windowHours}h` }
  }

  const evidenceItemIds = new Set<string>()
  for (const insight of recentInsights) {
    if (isEvidenceRefList(insight.evidence)) {
      for (const ref of insight.evidence) evidenceItemIds.add(ref.itemId)
    }
  }

  const evidenceItems =
    evidenceItemIds.size > 0
      ? await db
          .select({ id: items.id, rawContent: items.rawContent, sourceUrl: items.sourceUrl })
          .from(items)
          .where(inArray(items.id, Array.from(evidenceItemIds)))
      : []
  const evidenceTitleById = new Map(evidenceItems.map((item) => [item.id, evidenceItemTitle(item)]))

  const digestInsights: DigestInsight[] = recentInsights.map((insight) => ({
    title: insight.title,
    summary: insight.summary,
    evidenceTitles: isEvidenceRefList(insight.evidence)
      ? Array.from(new Set(insight.evidence.map((ref) => evidenceTitleById.get(ref.itemId) ?? ref.statement)))
      : [],
  }))

  const supabaseAdmin = createAdminClient()
  const { data, error: userError } = await supabaseAdmin.auth.admin.getUserById(workspace.ownerId)
  if (userError || !data.user?.email) {
    console.error(`daily-digest: could not resolve email for workspace ${workspaceId}`, userError)
    return { sent: false, insightsCount: digestInsights.length, reason: 'could not resolve user email' }
  }

  const { subject, html } = renderDigestEmail(digestInsights)

  try {
    await sendEmail({ to: data.user.email, subject, html })
    console.log(`daily-digest: sent to ${data.user.email} for workspace ${workspaceId} (${digestInsights.length} insights)`)
    return { sent: true, insightsCount: digestInsights.length }
  } catch (err) {
    console.error(`daily-digest: failed to send email for workspace ${workspaceId}`, err)
    return { sent: false, insightsCount: digestInsights.length, reason: 'email send failed' }
  }
}
