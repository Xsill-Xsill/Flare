import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { workspaces } from '@/lib/db/schema'
import { WorkspaceOnboarding } from './WorkspaceOnboarding'
import { AppShell } from '@/components/shell/AppShell'
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/workspace/cookie'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const userWorkspaces = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.ownerId, user.id))
    .orderBy(workspaces.createdAt)

  if (userWorkspaces.length === 0) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-6">
        <WorkspaceOnboarding />
      </main>
    )
  }

  // The active_workspace_id cookie is not httpOnly (the client also reads/writes it), so it
  // can only be trusted here if it still points at a workspace this user owns.
  const cookieStore = await cookies()
  const activeId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value
  const activeWorkspace = userWorkspaces.find((w) => w.id === activeId) ?? userWorkspaces[0]

  const displayName = (user.user_metadata?.full_name as string | undefined) || user.email?.split('@')[0] || 'User'

  return (
    <AppShell
      user={{ name: displayName, email: user.email ?? '' }}
      workspace={{ id: activeWorkspace.id, name: activeWorkspace.name }}
      workspaces={userWorkspaces.map((w) => ({ id: w.id, name: w.name }))}
    >
      {children}
    </AppShell>
  )
}
