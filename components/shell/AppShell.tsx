'use client'

import { useState } from 'react'
import { ShellDataProvider, type Workspace } from './WorkspaceContext'
import { SidebarUIProvider, useSidebarUI } from './SidebarUIContext'
import { ToastProvider } from './ToastProvider'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { AccountModal } from './AccountModal'

function MainArea({ children }: { children: React.ReactNode }) {
  const { collapsed, width } = useSidebarUI()
  return (
    <main
      className="ml-0 md:ml-[var(--sidebar-w)] flex-1 h-screen overflow-y-auto relative scroll-smooth flex flex-col transition-[margin] duration-200 ease-in-out pb-16 md:pb-0"
      style={{ '--sidebar-w': collapsed ? '0px' : `${width}px` } as React.CSSProperties}
    >
      {children}
    </main>
  )
}

export function AppShell({
  user,
  workspace,
  workspaces,
  children,
}: {
  user: { name: string; email: string }
  workspace: Workspace
  workspaces: Workspace[]
  children: React.ReactNode
}) {
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  const [planLabel, setPlanLabel] = useState('Free plan')

  return (
    <ShellDataProvider user={user} workspace={workspace} workspaces={workspaces}>
      <SidebarUIProvider>
        <ToastProvider>
          <div className="font-body-md text-body-md text-on-surface antialiased selection:bg-primary-fixed selection:text-on-primary-fixed h-screen overflow-hidden flex" style={{ background: '#F7F9F8' }}>
            <Sidebar
              userName={user.name}
              userPlanLabel={planLabel}
              onAccountClick={() => setAccountModalOpen(true)}
            />
            <MobileNav onAccountClick={() => setAccountModalOpen(true)} />
            <MainArea>{children}</MainArea>
            <AccountModal
              open={accountModalOpen}
              onClose={() => setAccountModalOpen(false)}
              userName={user.name}
              userEmail={user.email}
              onPlanChange={(plan) => setPlanLabel(plan === 'plus' ? 'Plus plan' : 'Free plan')}
            />
          </div>
        </ToastProvider>
      </SidebarUIProvider>
    </ShellDataProvider>
  )
}
