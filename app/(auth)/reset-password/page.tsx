'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { translateAuthError } from '@/lib/supabase/auth-errors'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    // The recovery link puts the session in the URL hash; the client SDK
    // picks it up on load (detectSessionInUrl) and fires PASSWORD_RECOVERY.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(translateAuthError(error.message))
      setLoading(false)
    } else {
      setDone(true)
      setTimeout(() => {
        router.push('/dashboard')
        router.refresh()
      }, 1500)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-[24rem]">
        <div className="flex flex-col items-center mb-8">
          <Image alt="Flare" src="/logo.png" width={48} height={48} className="w-12 h-12 rounded-lg object-contain mb-4" />
          <h1 className="text-2xl font-bold text-foreground">Set a new password</h1>
          <p className="text-sm text-muted mt-1">Choose a new password for your account</p>
        </div>

        <div className="bg-white border border-border rounded-xl shadow-sm p-6">
          {!ready ? (
            <p className="text-sm text-muted text-center py-4">
              Opening your reset link…
            </p>
          ) : done ? (
            <p className="text-sm rounded-lg px-3 py-2 bg-accent-soft text-accent border border-accent/20">
              Password updated, taking you to the app…
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="new-password" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">
                  New password
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 pr-10 text-sm text-foreground outline-none transition-shadow focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
                <p className="text-xs text-muted mt-1.5">At least 6 characters</p>
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
                {loading ? 'Saving…' : 'Save password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
