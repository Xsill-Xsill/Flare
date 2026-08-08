'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-[24rem]">
        <div className="flex flex-col items-center mb-8">
          <img alt="Flare" src="/logo.png" className="w-12 h-12 rounded-lg object-contain mb-4" />
          <h1 className="text-2xl font-bold text-foreground">Войти в Flare</h1>
          <p className="text-sm text-muted mt-1">С возвращением</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-shadow focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-shadow focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>

          {error && (
            <p className="text-sm rounded-lg px-3 py-2 bg-red-50 text-red-700 border border-red-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:opacity-90 active:scale-[0.99] transition text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? 'Входим…' : 'Войти'}
          </button>
        </form>

        <p className="text-sm text-center text-muted mt-6">
          Нет аккаунта?{' '}
          <Link href="/register" className="text-accent font-medium hover:underline">
            Зарегистрироваться
          </Link>
        </p>
      </div>
    </div>
  )
}
