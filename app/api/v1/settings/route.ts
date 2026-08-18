import { NextRequest, NextResponse } from 'next/server'
import { and, asc, desc, eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { folders, workspaces, workspaceSettings } from '@/lib/db/schema'

const MAX_NAME_LENGTH = 50
const MAX_INSTRUCTIONS_LENGTH = 2000

async function getOwnedWorkspace(workspaceId: string, userId: string) {
  const [row] = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, userId)))
    .limit(1)
  return row ?? null
}

// GET/PATCH aggregate the settings page's current data: workspace name, folder list, and
// notification/insight preferences. Schedule pickers aren't wired into any backend yet even
// though the column exists — see SettingsClient.tsx's Insights section.
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
    db
      .select({ digestEnabled: workspaceSettings.digestEnabled, insightsInstructions: workspaceSettings.insightsInstructions })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId))
      .limit(1),
  ])

  return NextResponse.json({
    workspaceId: workspace.id,
    name: workspace.name,
    folders: folderRows,
    // No settings row yet == user never touched Notifications/Insights == defaults apply.
    digestEnabled: settings?.digestEnabled ?? true,
    insightsInstructions: settings?.insightsInstructions ?? '',
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

  const settingsUpdate: { digestEnabled?: boolean; insightsInstructions?: string | null } = {}

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

  if (Object.keys(settingsUpdate).length > 0) {
    await db
      .insert(workspaceSettings)
      .values({ workspaceId, ...settingsUpdate })
      .onConflictDoUpdate({ target: workspaceSettings.workspaceId, set: settingsUpdate })
  }

  const [settings] = await db
    .select({ digestEnabled: workspaceSettings.digestEnabled, insightsInstructions: workspaceSettings.insightsInstructions })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .limit(1)

  return NextResponse.json({
    workspaceId,
    name,
    digestEnabled: settings?.digestEnabled ?? true,
    insightsInstructions: settings?.insightsInstructions ?? '',
  })
}
