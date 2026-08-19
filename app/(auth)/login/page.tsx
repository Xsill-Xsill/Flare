'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { translateAuthError } from '@/lib/supabase/auth-errors'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetting, setResetting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(translateAuthError(error.message))
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError('Enter your email to reset your password')
      return
    }
    setResetting(true)
    setError(null)
    const supabase = createClient()
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setResetting(false)
    setResetSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-[24rem]">
        <div className="flex flex-col items-center mb-8">
          <Image alt="Flare" src="/logo.png" width={48} height={48} className="w-12 h-12 rounded-lg object-contain mb-4" />
          <h1 className="text-2xl font-bold text-foreground">Log in to Flare</h1>
          <p className="text-sm text-muted mt-1">Welcome back</p>
        </div>

        <div className="bg-white border border-border rounded-xl shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1.5">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-shadow focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="block text-xs font-semibold uppercase tracking-wide text-muted">
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={resetting}
                  className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
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
            </div>

            {resetSent && (
              <p className="text-sm rounded-lg px-3 py-2 bg-accent-soft text-accent border border-accent/20">
                If an account exists for that email, a password reset link is on its way
              </p>
            )}

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
              {loading ? 'Logging in…' : 'Log in'}
            </button>
          </form>
        </div>

        <p className="text-sm text-center text-muted mt-6">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-accent font-medium hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
