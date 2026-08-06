import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { InboxClient } from './inbox-client'

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

  return (
    <main className="min-h-screen bg-background p-10 text-foreground">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🔥 Flare</h1>
          <p className="text-sm text-muted">{user.email}</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-surface transition-colors"
          >
            Выйти
          </button>
        </form>
      </div>
      <InboxClient />
    </main>
  )
}
