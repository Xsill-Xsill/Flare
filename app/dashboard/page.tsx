import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { workspaces } from '@/lib/db/schema'
import { WorkspaceOnboarding } from './WorkspaceOnboarding'
import { DashboardClient } from './DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  const userWorkspaces = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.ownerId, user.id))

  return (
    <main className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display-sm text-display-sm text-foreground">🔥 Flare</h1>
            <p className="text-sm text-muted">{user.email}</p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-ui-semibold text-foreground transition-colors hover:bg-surface"
            >
              Выйти
            </button>
          </form>
        </div>

        {userWorkspaces.length === 0 ? (
          <WorkspaceOnboarding />
        ) : (
          <DashboardClient workspaceId={userWorkspaces[0].id} />
        )}
      </div>
    </main>
  )
}
