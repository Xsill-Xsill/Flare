'use client'

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useWorkspace, type Workspace } from './WorkspaceContext'
import { useToast } from './ToastProvider'

export function WorkspaceSwitcher() {
  const { id, name, workspaces, switching, switchWorkspace, renameWorkspace, deleteWorkspace, createWorkspace } =
    useWorkspace()
  const showToast = useToast()

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [creating, setCreating] = useState(false)
  const [createValue, setCreateValue] = useState('')
  const [creatingBusy, setCreatingBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null)
  const [deleting, setDeleting] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setEditingId(null)
        setCreating(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  function startEdit(w: Workspace) {
    setEditingId(w.id)
    setEditValue(w.name)
  }

  async function commitEdit(w: Workspace) {
    const trimmed = editValue.trim()
    setEditingId(null)
    if (!trimmed || trimmed === w.name) return
    try {
      await renameWorkspace(w.id, trimmed)
      showToast('Workspace renamed', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to rename workspace', 'error')
    }
  }

  function handleEditKeyDown(e: KeyboardEvent<HTMLInputElement>, w: Workspace) {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      // Reset before closing so the blur this triggers is a no-op in commitEdit.
      setEditValue(w.name)
      setEditingId(null)
    }
  }

  async function handleSwitch(w: Workspace) {
    if (w.id === id || switching) return
    try {
      await switchWorkspace(w.id)
      setOpen(false)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to switch workspace', 'error')
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    const trimmed = createValue.trim()
    if (!trimmed) return
    setCreatingBusy(true)
    try {
      await createWorkspace(trimmed)
      setCreateValue('')
      setCreating(false)
      setOpen(false)
      showToast('Workspace created', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create workspace', 'error')
    } finally {
      setCreatingBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteWorkspace(deleteTarget.id)
      showToast('Workspace deleted', 'success')
      setOpen(false)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete workspace', 'error')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="relative min-w-0" ref={containerRef}>
      <button
        type="button"
        className="flex items-center gap-1 min-w-0 max-w-full text-left rounded-md hover:bg-surface-container-highest transition-colors px-1 -mx-1 py-0.5"
        onClick={() => setOpen((v) => !v)}
      >
        <p className="font-ui-semibold text-on-surface text-sm truncate">
          {name}
        </p>
        <span className="material-symbols-outlined text-[14px] text-on-surface-variant shrink-0">expand_more</span>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] w-[240px] bg-white border border-outline-variant/60 rounded-lg shadow-lg z-[70] py-1 max-h-[320px] overflow-y-auto">
          {workspaces.map((w) => (
            <div
              key={w.id}
              className={`flex items-center gap-1 px-2 py-1.5 text-sm group ${
                w.id === id ? 'bg-surface-container-highest' : 'hover:bg-surface-container-highest'
              }`}
            >
              {editingId === w.id ? (
                <input
                  autoFocus
                  className="flex-1 min-w-0 px-1.5 py-0.5 rounded-md border border-outline-variant/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  maxLength={50}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => handleEditKeyDown(e, w)}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={() => commitEdit(w)}
                />
              ) : (
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left truncate text-on-surface disabled:opacity-60"
                  disabled={switching}
                  onClick={() => handleSwitch(w)}
                >
                  {w.name}
                </button>
              )}
              {w.id === id && editingId !== w.id && (
                <span className="material-symbols-outlined text-[14px] text-primary shrink-0">check</span>
              )}
              {editingId !== w.id && (
                <>
                  <button
                    type="button"
                    aria-label={`Rename ${w.name}`}
                    className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-primary transition-opacity p-1 rounded shrink-0"
                    onClick={() => startEdit(w)}
                  >
                    <span className="material-symbols-outlined text-[14px]">edit</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${w.name}`}
                    className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-red-600 transition-opacity p-1 rounded shrink-0"
                    onClick={() => setDeleteTarget(w)}
                  >
                    <span className="material-symbols-outlined text-[14px]">delete</span>
                  </button>
                </>
              )}
            </div>
          ))}

          <div className="border-t border-outline-variant/40 mt-1 pt-1">
            {creating ? (
              <form onSubmit={handleCreate} className="px-2 py-1.5 flex items-center gap-1">
                <input
                  autoFocus
                  className="flex-1 min-w-0 px-1.5 py-0.5 rounded-md border border-outline-variant/60 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  disabled={creatingBusy}
                  maxLength={50}
                  placeholder="Workspace name"
                  type="text"
                  value={createValue}
                  onChange={(e) => setCreateValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setCreating(false)
                      setCreateValue('')
                    }
                  }}
                />
              </form>
            ) : (
              <button
                type="button"
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-sm text-on-surface-variant hover:text-primary hover:bg-surface-container-highest transition-colors"
                onClick={() => setCreating(true)}
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                New workspace
              </button>
            )}
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(26,38,32,0.5)' }}
            onClick={() => (!deleting ? setDeleteTarget(null) : undefined)}
          />
          <div className="relative bg-white rounded-xl w-full max-w-[420px] p-lg shadow-lg flex flex-col gap-3">
            <h3 className="font-ui-semibold text-base text-on-surface">Удалить workspace?</h3>
            <p className="text-sm text-on-surface-variant">
              Удалить workspace «{deleteTarget.name}»? Все данные будут удалены безвозвратно.
            </p>
            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                type="button"
                className="text-on-surface-variant hover:text-on-surface font-ui-semibold text-sm px-3 py-2 rounded-md transition-colors disabled:opacity-60"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="bg-red-600 hover:bg-red-700 text-white font-ui-semibold text-sm px-3 py-2 rounded-md transition-colors disabled:opacity-60"
                disabled={deleting}
                onClick={confirmDelete}
              >
                {deleting ? 'Удаление…' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
