'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export function WorkspaceOnboarding() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to create workspace')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[24rem] rounded-xl border border-border bg-white p-6"
      >
        <h2 className="font-headline-lg text-headline-lg text-foreground mb-3">
          Create your first workspace
        </h2>
        <p className="text-sm text-muted mb-6">
          This is where your notes, links, and files will live.
        </p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Workspace name"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="mt-6 w-full rounded-lg bg-accent px-4 py-2 text-sm font-ui-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
        >
          {busy ? 'Creating...' : 'Create'}
        </button>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </form>
    </div>
  )
}
