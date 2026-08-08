'use client'

import { useSidebarUI } from './SidebarUIContext'

export function SidebarToggleButton() {
  const { collapsed, toggle } = useSidebarUI()
  return (
    <button
      aria-label="Toggle sidebar"
      className="hidden md:flex items-center justify-center w-8 h-8 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors active:scale-95"
      onClick={toggle}
      type="button"
    >
      <span className="material-symbols-outlined text-[20px]">
        {collapsed ? 'left_panel_open' : 'left_panel_close'}
      </span>
    </button>
  )
}
