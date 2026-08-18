import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { workspaces, workspaceSettings } from '@/lib/db/schema'
import { inngest } from '@/lib/inngest/client'
import { sendDigestForWorkspace, type DigestResult } from '@/lib/insights/digest'

export const dailyDigest = inngest.createFunction(
  { id: 'daily-digest', triggers: [{ cron: '0 8 * * *' }] },
  async ({ step }) => {
    // LEFT JOIN so a workspace with no settings row (never touched the Notifications
    // section) still gets digestEnabled=true by default — only an explicit false skips it.
    const allWorkspaces = await step.run('list-workspaces', async () => {
      const rows = await db
        .select({ id: workspaces.id, digestEnabled: workspaceSettings.digestEnabled })
        .from(workspaces)
        .leftJoin(workspaceSettings, eq(workspaceSettings.workspaceId, workspaces.id))
      return rows.filter((row) => row.digestEnabled !== false).map((row) => ({ id: row.id }))
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
