import { and, eq, gte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { items, workspaces, workspaceSettings } from '@/lib/db/schema'
import { inngest } from '@/lib/inngest/client'
import { sendDigestForWorkspace, DIGEST_WINDOW_HOURS, type DigestResult } from '@/lib/insights/digest'

const THRESHOLD_NEW_ITEMS = 10
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

async function hasEnoughNewItemsForThreshold(workspaceId: string): Promise<boolean> {
  const since = new Date(Date.now() - DIGEST_WINDOW_HOURS * 60 * 60 * 1000)
  const rows = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.workspaceId, workspaceId), gte(items.createdAt, since)))
    .limit(THRESHOLD_NEW_ITEMS)
  return rows.length >= THRESHOLD_NEW_ITEMS
}

// The Inngest trigger itself stays a single global 08:00 UTC tick — there's no per-workspace
// cron in this setup. "Weekly"/"threshold" schedules are honored by filtering which workspaces
// are actually eligible on each tick, not by scheduling separate runs.
export const dailyDigest = inngest.createFunction(
  { id: 'daily-digest', triggers: [{ cron: '0 8 * * *' }] },
  async ({ step }) => {
    // LEFT JOIN so a workspace with no settings row (never touched the Notifications
    // section) still gets digestEnabled=true and schedule='daily' by default.
    const eligibleWorkspaces = await step.run('list-eligible-workspaces', async () => {
      const rows = await db
        .select({
          id: workspaces.id,
          digestEnabled: workspaceSettings.digestEnabled,
          schedule: workspaceSettings.insightsSchedule,
          scheduleDay: workspaceSettings.insightsScheduleDay,
        })
        .from(workspaces)
        .leftJoin(workspaceSettings, eq(workspaceSettings.workspaceId, workspaces.id))

      const todayName = WEEKDAY_NAMES[new Date().getUTCDay()]

      return rows
        .filter((row) => row.digestEnabled !== false)
        .filter((row) => {
          const schedule = row.schedule ?? 'daily'
          if (schedule !== 'weekly') return true
          return (row.scheduleDay ?? 'Monday') === todayName
        })
        .map((row) => ({ id: row.id, schedule: row.schedule ?? 'daily' }))
    })

    for (const workspace of eligibleWorkspaces) {
      // Isolated per workspace so one failing send (bad email, provider error, etc.)
      // doesn't stop the digest from going out to everyone else.
      await step.run(`send-digest-${workspace.id}`, async (): Promise<DigestResult> => {
        try {
          if (workspace.schedule === 'threshold' && !(await hasEnoughNewItemsForThreshold(workspace.id))) {
            return { sent: false, insightsCount: 0, reason: `fewer than ${THRESHOLD_NEW_ITEMS} new notes today` }
          }
          // Weekly workspaces only get evaluated once every 7 days (see the day-of-week
          // filter above), so their digest needs to cover the whole week, not just today.
          const windowHours = workspace.schedule === 'weekly' ? DIGEST_WINDOW_HOURS * 7 : DIGEST_WINDOW_HOURS
          return await sendDigestForWorkspace(workspace.id, windowHours)
        } catch (err) {
          console.error(`daily-digest: unexpected failure for workspace ${workspace.id}`, err)
          return { sent: false, insightsCount: 0, reason: 'unexpected error' }
        }
      })
    }
  }
)
