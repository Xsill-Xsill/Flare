import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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
    <main className="min-h-screen p-10 font-mono bg-black text-lime-400">
      <h1 className="text-2xl font-bold mb-4">🔥 Flare Dashboard</h1>
      <p className="mb-2">Залогинен как: <strong>{user.email}</strong></p>
      <p className="text-sm text-lime-600 mb-6">User ID: {user.id}</p>
      <form action={signOut}>
        <button
          type="submit"
          className="border border-lime-400 px-4 py-2 text-sm hover:bg-lime-400 hover:text-black transition-colors"
        >
          Выйти
        </button>
      </form>
    </main>
  )
}
