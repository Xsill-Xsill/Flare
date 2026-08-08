'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const COLLAPSED_KEY = 'flare-sidebar-collapsed'
const WIDTH_KEY = 'flare-sidebar-width'
const DEFAULT_WIDTH = 200
const MIN_WIDTH = 64
const MAX_WIDTH = 240

type SidebarUI = {
  collapsed: boolean
  width: number
  iconOnly: boolean
  toggle: () => void
  setWidth: (px: number) => void
}

const SidebarUIContext = createContext<SidebarUI | null>(null)

export function useSidebarUI() {
  const ctx = useContext(SidebarUIContext)
  if (!ctx) throw new Error('useSidebarUI must be used within SidebarUIProvider')
  return ctx
}

export function SidebarUIProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidthState] = useState(DEFAULT_WIDTH)

  useEffect(() => {
    const savedWidth = parseInt(localStorage.getItem(WIDTH_KEY) || '', 10)
    if (savedWidth >= MIN_WIDTH && savedWidth <= MAX_WIDTH) setWidthState(savedWidth)
    setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1')
  }, [])

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
      return next
    })
  }

  function setWidth(px: number) {
    const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, px))
    setWidthState(clamped)
    localStorage.setItem(WIDTH_KEY, String(clamped))
  }

  const ICON_ONLY_THRESHOLD = 100
  const iconOnly = !collapsed && width <= ICON_ONLY_THRESHOLD

  return (
    <SidebarUIContext.Provider value={{ collapsed, width, iconOnly, toggle, setWidth }}>
      {children}
    </SidebarUIContext.Provider>
  )
}
