import { NextRequest, NextResponse } from 'next/server'
import { and, asc, desc, eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { folders, workspaces, workspaceSettings } from '@/lib/db/schema'

const MAX_NAME_LENGTH = 50
const MAX_INSTRUCTIONS_LENGTH = 2000
const INSIGHTS_SCHEDULES = new Set(['daily', 'weekly', 'threshold'])
const INSIGHTS_LANGUAGES = new Set(['auto', 'en', 'ru'])
const WEEKDAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])

const SETTINGS_COLUMNS = {
  digestEnabled: workspaceSettings.digestEnabled,
  insightsInstructions: workspaceSettings.insightsInstructions,
  notifyNewInsight: workspaceSettings.notifyNewInsight,
  notifyProcessingDone: workspaceSettings.notifyProcessingDone,
  insightsSchedule: workspaceSettings.insightsSchedule,
  insightsScheduleDay: workspaceSettings.insightsScheduleDay,
  insightsLanguage: workspaceSettings.insightsLanguage,
} as const

async function getOwnedWorkspace(workspaceId: string, userId: string) {
  const [row] = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, userId)))
    .limit(1)
  return row ?? null
}

// GET/PATCH aggregate the settings page's current data: workspace name, folder list, and
// notification/insight preferences. insightsSchedule/insightsScheduleDay are read by
// daily-digest.ts to decide which workspaces are eligible on each daily tick.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
  }

  const workspace = await getOwnedWorkspace(workspaceId, user.id)
  if (!workspace) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })

  const [folderRows, [settings]] = await Promise.all([
    db
      .select({ id: folders.id, name: folders.name, isDefault: folders.isDefault, description: folders.description })
      .from(folders)
      .where(eq(folders.workspaceId, workspaceId))
      .orderBy(desc(folders.isDefault), asc(folders.name)),
    db.select(SETTINGS_COLUMNS).from(workspaceSettings).where(eq(workspaceSettings.workspaceId, workspaceId)).limit(1),
  ])

  return NextResponse.json({
    workspaceId: workspace.id,
    name: workspace.name,
    folders: folderRows,
    // No settings row yet == user never touched Notifications/Insights == defaults apply.
    digestEnabled: settings?.digestEnabled ?? true,
    insightsInstructions: settings?.insightsInstructions ?? '',
    notifyNewInsight: settings?.notifyNewInsight ?? true,
    notifyProcessingDone: settings?.notifyProcessingDone ?? false,
    insightsSchedule: settings?.insightsSchedule ?? 'daily',
    insightsScheduleDay: settings?.insightsScheduleDay ?? 'Monday',
    insightsLanguage: settings?.insightsLanguage ?? 'auto',
  })
}

// Workspace name updates also have a dedicated endpoint (PATCH /api/v1/workspaces/[id]),
// used by the sidebar's WorkspaceSwitcher via useWorkspace().renameWorkspace() so the name
// stays in sync everywhere it's cached client-side. This route performs the same update for
// API completeness (settings page can PATCH here directly), writing to the same column.
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : ''
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
  }

  const workspace = await getOwnedWorkspace(workspaceId, user.id)
  if (!workspace) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })

  let name = workspace.name
  if (body.name !== undefined) {
    name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (name.length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: `name must be ${MAX_NAME_LENGTH} characters or fewer` }, { status: 400 })
    }
    await db.update(workspaces).set({ name }).where(eq(workspaces.id, workspaceId))
  }

  const settingsUpdate: {
    digestEnabled?: boolean
    insightsInstructions?: string | null
    notifyNewInsight?: boolean
    notifyProcessingDone?: boolean
    insightsSchedule?: string
    insightsScheduleDay?: string | null
    insightsLanguage?: string
  } = {}

  if (body.digest_enabled !== undefined) {
    if (typeof body.digest_enabled !== 'boolean') {
      return NextResponse.json({ error: 'digest_enabled must be a boolean' }, { status: 400 })
    }
    settingsUpdate.digestEnabled = body.digest_enabled
  }

  if (body.insights_instructions !== undefined) {
    if (body.insights_instructions !== null && typeof body.insights_instructions !== 'string') {
      return NextResponse.json({ error: 'insights_instructions must be a string or null' }, { status: 400 })
    }
    const trimmed = typeof body.insights_instructions === 'string' ? body.insights_instructions.trim() : ''
    if (trimmed.length > MAX_INSTRUCTIONS_LENGTH) {
      return NextResponse.json(
        { error: `insights_instructions must be ${MAX_INSTRUCTIONS_LENGTH} characters or fewer` },
        { status: 400 }
      )
    }
    settingsUpdate.insightsInstructions = trimmed || null
  }

  if (body.notify_new_insight !== undefined) {
    if (typeof body.notify_new_insight !== 'boolean') {
      return NextResponse.json({ error: 'notify_new_insight must be a boolean' }, { status: 400 })
    }
    settingsUpdate.notifyNewInsight = body.notify_new_insight
  }

  if (body.notify_processing_done !== undefined) {
    if (typeof body.notify_processing_done !== 'boolean') {
      return NextResponse.json({ error: 'notify_processing_done must be a boolean' }, { status: 400 })
    }
    settingsUpdate.notifyProcessingDone = body.notify_processing_done
  }

  if (body.insights_schedule !== undefined) {
    if (typeof body.insights_schedule !== 'string' || !INSIGHTS_SCHEDULES.has(body.insights_schedule)) {
      return NextResponse.json({ error: 'insights_schedule must be one of daily, weekly, threshold' }, { status: 400 })
    }
    settingsUpdate.insightsSchedule = body.insights_schedule
  }

  if (body.insights_schedule_day !== undefined) {
    if (body.insights_schedule_day !== null && (typeof body.insights_schedule_day !== 'string' || !WEEKDAYS.has(body.insights_schedule_day))) {
      return NextResponse.json({ error: 'insights_schedule_day must be a valid weekday or null' }, { status: 400 })
    }
    settingsUpdate.insightsScheduleDay = body.insights_schedule_day
  }

  if (body.insights_language !== undefined) {
    if (typeof body.insights_language !== 'string' || !INSIGHTS_LANGUAGES.has(body.insights_language)) {
      return NextResponse.json({ error: 'insights_language must be one of auto, en, ru' }, { status: 400 })
    }
    settingsUpdate.insightsLanguage = body.insights_language
  }

  if (Object.keys(settingsUpdate).length > 0) {
    await db
      .insert(workspaceSettings)
      .values({ workspaceId, ...settingsUpdate })
      .onConflictDoUpdate({ target: workspaceSettings.workspaceId, set: settingsUpdate })
  }

  const [settings] = await db.select(SETTINGS_COLUMNS).from(workspaceSettings).where(eq(workspaceSettings.workspaceId, workspaceId)).limit(1)

  return NextResponse.json({
    workspaceId,
    name,
    digestEnabled: settings?.digestEnabled ?? true,
    insightsInstructions: settings?.insightsInstructions ?? '',
    notifyNewInsight: settings?.notifyNewInsight ?? true,
    notifyProcessingDone: settings?.notifyProcessingDone ?? false,
    insightsSchedule: settings?.insightsSchedule ?? 'daily',
    insightsScheduleDay: settings?.insightsScheduleDay ?? 'Monday',
    insightsLanguage: settings?.insightsLanguage ?? 'auto',
  })
}
