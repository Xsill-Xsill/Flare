import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { insights } from '@/lib/db/schema'
import { detectRepeatedProblems } from '@/lib/insights/detectors/repeated-problem'
import type { DetectorResult } from '@/lib/insights/types'
import { inngest } from '@/lib/inngest/client'

export const runDetectors = inngest.createFunction(
  { id: 'run-detectors', triggers: [{ event: 'detectors/run' }] },
  async ({ event, step }) => {
    const { workspaceId } = event.data as { workspaceId: string }

    const detectorResults = await step.run('repeated-problem', async (): Promise<DetectorResult[]> => {
      return detectRepeatedProblems(workspaceId)
    })

    await step.run('save-insights', async () => {
      for (const insight of detectorResults) {
        const [existing] = await db
          .select({ id: insights.id })
          .from(insights)
          .where(
            and(
              eq(insights.workspaceId, workspaceId),
              eq(insights.detectorType, 'repeated-problem'),
              eq(insights.title, insight.title)
            )
          )
          .limit(1)

        if (!existing) {
          await db.insert(insights).values({
            workspaceId,
            detectorType: 'repeated-problem',
            title: insight.title,
            summary: insight.summary,
            evidence: insight.evidence,
          })
        }
      }
    })
  }
)
