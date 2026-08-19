'use client'

import { useState } from 'react'

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  requireTypedConfirmation,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  /** If set, the confirm button stays disabled until the user types this exact string. */
  requireTypedConfirmation?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')

  if (!open) return null

  const locked = requireTypedConfirmation !== undefined && typed !== requireTypedConfirmation

  function handleCancel() {
    setTyped('')
    onCancel()
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(26,38,32,0.5)' }}
        onClick={() => (!loading ? handleCancel() : undefined)}
      />
      <div className="relative bg-white rounded-xl w-full max-w-[420px] p-lg shadow-lg flex flex-col gap-3">
        <h3 className="font-ui-semibold text-base text-on-surface">{title}</h3>
        <p className="text-sm text-on-surface-variant">{description}</p>
        {requireTypedConfirmation && (
          <div>
            <label className="block text-xs text-on-surface-variant mb-1">
              Type <span className="font-ui-semibold text-on-surface">{requireTypedConfirmation}</span> to
              confirm
            </label>
            <input
              className="w-full px-3 py-2 rounded-lg text-sm border border-outline-variant focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              type="text"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={loading}
            />
          </div>
        )}
        <div className="flex items-center justify-end gap-2 mt-2">
          <button
            type="button"
            className="text-on-surface-variant hover:text-on-surface font-ui-semibold text-sm px-3 py-2 rounded-md transition-colors disabled:opacity-60"
            disabled={loading}
            onClick={handleCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="bg-red-600 hover:bg-red-700 text-white font-ui-semibold text-sm px-3 py-2 rounded-md transition-colors disabled:opacity-60"
            disabled={loading || locked}
            onClick={onConfirm}
          >
            {loading ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
