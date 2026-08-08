'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'

type ToastType = 'error' | 'success'
type Toast = { id: number; message: string; type: ToastType }

const STYLES: Record<ToastType, { bg: string; border: string; text: string; icon: string; iconName: string }> = {
  error: { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C', icon: '#DC2626', iconName: 'error' },
  success: { bg: '#F0FDF9', border: 'rgba(13,159,110,0.25)', text: '#0D9F6E', icon: '#0D9F6E', iconName: 'check_circle' },
}

const ToastContext = createContext<((message: string, type?: ToastType) => void) | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const showToast = useCallback((message: string, type: ToastType = 'error') => {
    const id = ++idRef.current
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => {
      setToasts((t) => t.filter((toast) => toast.id !== id))
    }, 3200)
  }, [])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div
        className="fixed left-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none bottom-20 md:bottom-6"
        style={{ transform: 'translateX(-50%)' }}
      >
        {toasts.map((toast) => {
          const style = STYLES[toast.type]
          return (
            <div
              key={toast.id}
              className="flex items-center gap-2 rounded-lg pointer-events-auto shadow-lg animate-toast-in"
              style={{
                background: style.bg,
                border: `1px solid ${style.border}`,
                color: style.text,
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 600,
                maxWidth: 'min(90vw, 420px)',
              }}
            >
              <span className="material-symbols-outlined text-[18px]" style={{ color: style.icon }}>
                {style.iconName}
              </span>
              <span>{toast.message}</span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
