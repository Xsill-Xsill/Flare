'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { useSidebarUI } from './SidebarUIContext'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

const NAV_ITEMS = [
  { key: 'home', href: '/dashboard', label: 'Home', icon: '/assets/images/nav-home.png' },
  { key: 'vault', href: '/vault', label: 'Vault', icon: '/assets/images/nav-vault.png' },
  { key: 'insights', href: '/insights', label: 'Insights', icon: '/assets/images/nav-insights.svg' },
  { key: 'settings', href: '/settings', label: 'Settings', icon: '/assets/images/nav-settings.png' },
]

function activeKeyForPath(pathname: string) {
  const match = NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(item.href + '/'))
  return match?.key
}

export function Sidebar({
  userName,
  userPlanLabel,
  onAccountClick,
}: {
  userName: string
  userPlanLabel: string
  onAccountClick: () => void
}) {
  const pathname = usePathname()
  const activeKey = activeKeyForPath(pathname)
  const { collapsed, width, iconOnly, setWidth } = useSidebarUI()
  const resizeHandleRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const collapsedRef = useRef(collapsed)
  const widthRef = useRef(width)
  const setWidthRef = useRef(setWidth)
  collapsedRef.current = collapsed
  widthRef.current = width
  setWidthRef.current = setWidth

  useEffect(() => {
    const handle = resizeHandleRef.current
    const sidebar = sidebarRef.current
    if (!handle || !sidebar) return

    let dragging = false
    let startX = 0
    let startWidth = 0

    function onMouseDown(e: MouseEvent) {
      if (collapsedRef.current) return
      dragging = true
      startX = e.clientX
      startWidth = widthRef.current
      sidebar!.style.transition = 'none'
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      e.preventDefault()
    }
    function onMouseMove(e: MouseEvent) {
      if (!dragging) return
      setWidthRef.current(startWidth + (e.clientX - startX))
    }
    function onMouseUp() {
      if (!dragging) return
      dragging = false
      sidebar!.style.transition = ''
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    handle.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      handle.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const renderedWidth = collapsed ? 0 : width

  return (
    <nav
      ref={sidebarRef}
      className="hidden md:flex bg-surface-container-low border-r-[1.5px] border-outline-variant h-screen fixed left-0 top-0 flex-col justify-between py-md z-50 transition-[width,opacity] duration-200 ease-in-out overflow-hidden"
      style={{
        width: renderedWidth,
        opacity: collapsed ? 0 : 1,
        borderRightWidth: collapsed ? '0px' : '1.5px',
      }}
    >
      <div>
        <div
          className="px-md mb-lg flex items-center gap-sm"
          style={iconOnly ? { justifyContent: 'center', paddingLeft: 0, paddingRight: 0, marginTop: 12 } : undefined}
        >
          <Link
            href="/dashboard"
            className="rounded-lg hover:opacity-80 active:scale-95 transition-all duration-150 shrink-0"
          >
            <Image
              alt="Flare Brand Logo"
              width={64}
              height={64}
              className="rounded-lg object-contain"
              style={iconOnly ? { width: 30, height: 30 } : { width: 64, height: 64 }}
              src="/assets/images/logo.png"
            />
          </Link>
          {!iconOnly && (
            <div className="min-w-0">
              <WorkspaceSwitcher />
            </div>
          )}
        </div>
        <ul className="flex flex-col gap-xs px-sm font-ui-semibold text-ui-semibold">
          {NAV_ITEMS.map((item) => {
            const isActive = item.key === activeKey
            return (
              <li className="relative" key={item.key}>
                {isActive && (
                  <span className="absolute left-[-12px] top-1/2 -translate-y-1/2 h-[calc(100%+8px)] w-[3px] rounded-r-full bg-primary" />
                )}
                <Link
                  href={item.href}
                  title={item.label}
                  className={`flex items-center gap-sm px-sm py-sm rounded-lg hover:bg-surface-container-highest transition-colors active:scale-95 duration-150 group ${
                    isActive ? 'text-primary font-bold' : 'text-on-surface-variant'
                  }`}
                  style={iconOnly ? { justifyContent: 'center', paddingLeft: 0, paddingRight: 0 } : undefined}
                >
                  <Image alt={item.label} width={20} height={20} className="w-5 h-5 shrink-0" src={item.icon} />
                  {!iconOnly && (
                    <span className="group-hover:text-on-surface transition-colors" style={{ whiteSpace: 'nowrap' }}>
                      {item.label}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
      <div className="px-sm" style={iconOnly ? { justifyContent: 'center', paddingLeft: 0, paddingRight: 0 } : undefined}>
        <button
          className="flex items-center gap-sm px-sm py-sm rounded-lg hover:opacity-90 transition-all active:scale-95 duration-150 group text-on-surface w-full"
          style={iconOnly ? { justifyContent: 'center', paddingLeft: 0, paddingRight: 0 } : undefined}
          title="Account"
          type="button"
          onClick={onAccountClick}
        >
          <span
            className="material-symbols-outlined text-[28px] text-primary shrink-0"
            style={{ fontVariationSettings: '"FILL" 1' }}
          >
            account_circle
          </span>
          {!iconOnly && (
            <div className="flex flex-col items-start min-w-0">
              <span className="font-ui-semibold text-ui-semibold" style={{ whiteSpace: 'nowrap' }}>
                {userName}
              </span>
              <span
                className="font-metadata-mono text-metadata-mono text-[10px] text-on-surface-variant"
                style={{ whiteSpace: 'nowrap' }}
              >
                {userPlanLabel}
              </span>
            </div>
          )}
        </button>
      </div>
      <div
        ref={resizeHandleRef}
        className="hidden md:flex items-center justify-center absolute top-0 right-0 h-full group/resize"
        style={{ width: 6, cursor: 'col-resize', zIndex: 60 }}
      >
        <div className="w-[2px] h-full bg-transparent group-hover/resize:bg-primary/40 group-active/resize:bg-primary/70 transition-colors duration-150" />
      </div>
    </nav>
  )
}
