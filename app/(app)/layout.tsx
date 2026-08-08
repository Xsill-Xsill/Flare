import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { workspaces } from '@/lib/db/schema'
import { WorkspaceOnboarding } from './WorkspaceOnboarding'
import { AppShell } from '@/components/shell/AppShell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const userWorkspaces = await db.select().from(workspaces).where(eq(workspaces.ownerId, user.id))

  if (userWorkspaces.length === 0) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-6">
        <WorkspaceOnboarding />
      </main>
    )
  }

  const workspace = userWorkspaces[0]
  const displayName = (user.user_metadata?.full_name as string | undefined) || user.email?.split('@')[0] || 'User'

  return (
    <AppShell user={{ name: displayName, email: user.email ?? '' }} workspace={{ id: workspace.id, name: workspace.name }}>
      {children}
    </AppShell>
  )
}
