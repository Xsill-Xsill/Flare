'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/workspace/cookie'

export type Workspace = { id: string; name: string }
type ShellUser = { name: string; email: string }

type WorkspaceContextValue = Workspace & {
  workspaces: Workspace[]
  switching: boolean
  switchWorkspace: (id: string) => Promise<void>
  renameWorkspace: (id: string, name: string) => Promise<void>
  deleteWorkspace: (id: string) => Promise<void>
  createWorkspace: (name: string) => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)
const UserContext = createContext<ShellUser | null>(null)

async function parseError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json()
    return typeof body?.error === 'string' ? body.error : fallback
  } catch {
    return fallback
  }
}

export function ShellDataProvider({
  workspace,
  workspaces: initialWorkspaces,
  user,
  children,
}: {
  workspace: Workspace
  workspaces: Workspace[]
  user: ShellUser
  children: React.ReactNode
}) {
  const router = useRouter()
  const [activeWorkspace, setActiveWorkspace] = useState(workspace)
  const [workspaces, setWorkspaces] = useState(initialWorkspaces)
  const [switching, setSwitching] = useState(false)

  // Adjust local state during render (not in an effect) whenever the server resolves a
  // different workspace/list — e.g. after router.refresh() following a switch/delete.
  const [syncedWorkspace, setSyncedWorkspace] = useState(workspace)
  if (workspace.id !== syncedWorkspace.id || workspace.name !== syncedWorkspace.name) {
    setSyncedWorkspace(workspace)
    setActiveWorkspace(workspace)
  }
  const [syncedWorkspaces, setSyncedWorkspaces] = useState(initialWorkspaces)
  if (syncedWorkspaces !== initialWorkspaces) {
    setSyncedWorkspaces(initialWorkspaces)
    setWorkspaces(initialWorkspaces)
  }

  // The cookie is intentionally not httpOnly. This keeps it in sync on the very first visit,
  // when the server picked a default workspace but couldn't write the cookie from a Server
  // Component (cookies can only be set from a Server Action or Route Handler).
  useEffect(() => {
    document.cookie = `${ACTIVE_WORKSPACE_COOKIE}=${activeWorkspace.id}; path=/; max-age=31536000; SameSite=Lax`
  }, [activeWorkspace.id])

  const switchWorkspace = useCallback(
    async (id: string) => {
      if (id === activeWorkspace.id) return
      setSwitching(true)
      try {
        const res = await fetch('/api/v1/workspaces/switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: id }),
        })
        if (!res.ok) throw new Error(await parseError(res, 'Failed to switch workspace'))
        const next: Workspace = await res.json()
        setActiveWorkspace(next)
        router.refresh()
      } finally {
        setSwitching(false)
      }
    },
    [activeWorkspace.id, router]
  )

  const renameWorkspace = useCallback(async (id: string, name: string) => {
    const res = await fetch(`/api/v1/workspaces/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) throw new Error(await parseError(res, 'Failed to rename workspace'))
    const updated: Workspace = await res.json()
    setWorkspaces((list) => list.map((w) => (w.id === id ? updated : w)))
    setActiveWorkspace((current) => (current.id === id ? updated : current))
  }, [])

  const deleteWorkspace = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/v1/workspaces/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await parseError(res, 'Failed to delete workspace'))
      const { activeWorkspace: next }: { activeWorkspace: Workspace } = await res.json()
      setWorkspaces((list) => list.filter((w) => w.id !== id))
      setActiveWorkspace(next)
      router.refresh()
    },
    [router]
  )

  const createWorkspace = useCallback(
    async (name: string) => {
      const res = await fetch('/api/v1/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error(await parseError(res, 'Failed to create workspace'))
      const created: Workspace = await res.json()
      setWorkspaces((list) => [...list, created])
      await switchWorkspace(created.id)
    },
    [switchWorkspace]
  )

  const value: WorkspaceContextValue = {
    ...activeWorkspace,
    workspaces,
    switching,
    switchWorkspace,
    renameWorkspace,
    deleteWorkspace,
    createWorkspace,
  }

  return (
    <WorkspaceContext.Provider value={value}>
      <UserContext.Provider value={user}>{children}</UserContext.Provider>
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within ShellDataProvider')
  return ctx
}

export function useShellUser() {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useShellUser must be used within ShellDataProvider')
  return ctx
}
