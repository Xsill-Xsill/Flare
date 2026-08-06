'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

type Workspace = {
  id: string
  name: string
  createdAt: string
}

type Item = {
  id: string
  type: 'text' | 'url' | 'file' | 'audio'
  rawContent: string | null
  sourceUrl: string | null
  status: 'queued' | 'processing' | 'done' | 'failed'
  createdAt: string
}

const WORKSPACE_STORAGE_KEY = 'flare.workspaceId'

const TYPE_ICON: Record<Item['type'], string> = {
  text: '📝',
  url: '🔗',
  file: '📄',
  audio: '🎙️',
}

const STATUS_LABEL: Record<Item['status'], string> = {
  queued: 'В очереди',
  processing: 'Обрабатывается',
  done: 'Готово',
  failed: 'Ошибка',
}

export function InboxClient() {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [noteText, setNoteText] = useState('')
  const [urlText, setUrlText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadWorkspaces()
  }, [])

  useEffect(() => {
    if (workspaceId) loadItems(workspaceId)
  }, [workspaceId])

  async function loadWorkspaces() {
    const res = await fetch('/api/v1/workspaces')
    const data: Workspace[] = await res.json()
    setWorkspaces(data)

    const stored = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null
    const match = data.find((w) => w.id === stored)
    if (match) {
      setWorkspaceId(match.id)
    } else if (data.length > 0) {
      setWorkspaceId(data[0].id)
      localStorage.setItem(WORKSPACE_STORAGE_KEY, data[0].id)
    }
  }

  async function loadItems(wsId: string) {
    const res = await fetch(`/api/v1/items?workspaceId=${wsId}&limit=20`)
    if (!res.ok) return
    const data: Item[] = await res.json()
    setItems(data)
  }

  async function createWorkspace(e: FormEvent) {
    e.preventDefault()
    if (!newWorkspaceName.trim()) return
    setBusy('workspace')
    setError(null)
    try {
      const res = await fetch('/api/v1/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newWorkspaceName.trim() }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Не удалось создать workspace')
      const workspace: Workspace = await res.json()
      setWorkspaces((prev) => [...(prev ?? []), workspace])
      setWorkspaceId(workspace.id)
      localStorage.setItem(WORKSPACE_STORAGE_KEY, workspace.id)
      setNewWorkspaceName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(null)
    }
  }

  async function saveNote(e: FormEvent) {
    e.preventDefault()
    if (!workspaceId || !noteText.trim()) return
    setBusy('note')
    setError(null)
    try {
      const res = await fetch('/api/v1/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, type: 'text', rawContent: noteText.trim() }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Не удалось сохранить заметку')
      setNoteText('')
      await loadItems(workspaceId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(null)
    }
  }

  async function saveLink(e: FormEvent) {
    e.preventDefault()
    if (!workspaceId || !urlText.trim()) return
    setBusy('url')
    setError(null)
    try {
      const res = await fetch('/api/v1/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, type: 'url', sourceUrl: urlText.trim() }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Не удалось сохранить ссылку')
      setUrlText('')
      await loadItems(workspaceId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(null)
    }
  }

  async function uploadFile(e: FormEvent) {
    e.preventDefault()
    if (!workspaceId || !file) return
    setBusy('file')
    setError(null)
    try {
      const supabase = createClient()
      const path = `${workspaceId}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage.from('uploads').upload(path, file)
      if (uploadError) throw uploadError

      const res = await fetch('/api/v1/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, type: 'file', sourceUrl: path }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Не удалось сохранить файл')
      setFile(null)
      await loadItems(workspaceId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки файла')
    } finally {
      setBusy(null)
    }
  }

  if (workspaces === null) {
    return <p className="text-muted">Загрузка...</p>
  }

  if (workspaces.length === 0) {
    return (
      <form onSubmit={createWorkspace} className="max-w-sm space-y-3">
        <h2 className="text-lg font-semibold">Создай свой первый workspace</h2>
        <input
          type="text"
          value={newWorkspaceName}
          onChange={(e) => setNewWorkspaceName(e.target.value)}
          placeholder="Workspace name"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy === 'workspace'}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy === 'workspace' ? 'Создаём...' : 'Create'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    )
  }

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="grid gap-4 md:grid-cols-3">
        <form onSubmit={saveNote} className="space-y-2 rounded-lg border border-border bg-surface p-4">
          <label className="text-sm font-medium">Заметка</label>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="What's on your mind?"
            rows={3}
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy === 'note' || !noteText.trim()}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === 'note' ? 'Сохраняем...' : 'Save note'}
          </button>
        </form>

        <form onSubmit={saveLink} className="space-y-2 rounded-lg border border-border bg-surface p-4">
          <label className="text-sm font-medium">Ссылка</label>
          <input
            type="url"
            value={urlText}
            onChange={(e) => setUrlText(e.target.value)}
            placeholder="Paste a link..."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy === 'url' || !urlText.trim()}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === 'url' ? 'Сохраняем...' : 'Save link'}
          </button>
        </form>

        <form onSubmit={uploadFile} className="space-y-2 rounded-lg border border-border bg-surface p-4">
          <label className="text-sm font-medium">Файл (PDF, TXT, MD)</label>
          <input
            type="file"
            accept=".pdf,.txt,.md"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
          <button
            type="submit"
            disabled={busy === 'file' || !file}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === 'file' ? 'Загружаем...' : 'Upload'}
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Inbox</h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted">Пока пусто — добавь первую заметку.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span>{TYPE_ICON[item.type]}</span>
                <span className="flex-1 truncate">
                  {item.type === 'text' ? item.rawContent : item.sourceUrl}
                </span>
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">
                  {STATUS_LABEL[item.status]}
                </span>
                <span className="text-xs text-muted">
                  {new Date(item.createdAt).toLocaleString('ru-RU')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
