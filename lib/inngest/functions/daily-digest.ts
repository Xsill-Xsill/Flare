import { db } from '@/lib/db'
import { workspaces } from '@/lib/db/schema'
import { inngest } from '@/lib/inngest/client'
import { sendDigestForWorkspace, type DigestResult } from '@/lib/insights/digest'

export const dailyDigest = inngest.createFunction(
  { id: 'daily-digest', triggers: [{ cron: '0 8 * * *' }] },
  async ({ step }) => {
    const allWorkspaces = await step.run('list-workspaces', async () => {
      return db.select({ id: workspaces.id }).from(workspaces)
    })

    for (const workspace of allWorkspaces) {
      // Isolated per workspace so one failing send (bad email, provider error, etc.)
      // doesn't stop the digest from going out to everyone else.
      await step.run(`send-digest-${workspace.id}`, async (): Promise<DigestResult> => {
        try {
          return await sendDigestForWorkspace(workspace.id)
        } catch (err) {
          console.error(`daily-digest: unexpected failure for workspace ${workspace.id}`, err)
          return { sent: false, insightsCount: 0, reason: 'unexpected error' }
        }
      })
    }
  }
)
