import { createHash } from 'node:crypto'
import { db } from '@/lib/db'
import { insights } from '@/lib/db/schema'
import { detectRepeatedProblems } from '@/lib/insights/detectors/repeated-problem'
import type { DetectorResult } from '@/lib/insights/types'
import { inngest } from '@/lib/inngest/client'

function patternHashFor(title: string): string {
  return createHash('sha256').update(title.trim().toLowerCase()).digest('hex')
}

export const runDetectors = inngest.createFunction(
  { id: 'run-detectors', triggers: [{ event: 'detectors/run' }] },
  async ({ event, step }) => {
    const { workspaceId } = event.data as { workspaceId: string }

    const detectorResults = await step.run('repeated-problem', async (): Promise<DetectorResult[]> => {
      return detectRepeatedProblems(workspaceId)
    })

    await step.run('save-insights', async () => {
      for (const insight of detectorResults) {
        await db
          .insert(insights)
          .values({
            workspaceId,
            detectorType: 'repeated-problem',
            title: insight.title,
            summary: insight.summary,
            evidence: insight.evidence,
            patternHash: patternHashFor(insight.title),
          })
          .onConflictDoNothing({ target: [insights.workspaceId, insights.patternHash] })
      }
    })
  }
)
