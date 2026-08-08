'use client'

import { createContext, useContext } from 'react'

type Workspace = { id: string; name: string }
type ShellUser = { name: string; email: string }

const WorkspaceContext = createContext<Workspace | null>(null)
const UserContext = createContext<ShellUser | null>(null)

export function ShellDataProvider({
  workspace,
  user,
  children,
}: {
  workspace: Workspace
  user: ShellUser
  children: React.ReactNode
}) {
  return (
    <WorkspaceContext.Provider value={workspace}>
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
