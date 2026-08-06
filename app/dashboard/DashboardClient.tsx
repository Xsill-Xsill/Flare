'use client'

import { useEffect, useState, type FormEvent } from 'react'

type Item = {
  id: string
  type: 'text' | 'url' | 'file' | 'audio'
  rawContent: string | null
  sourceUrl: string | null
  status: 'queued' | 'processing' | 'done' | 'failed'
  createdAt: string
}

type CaptureMode = 'text' | 'url' | 'file'

const MODE_LABEL: Record<CaptureMode, string> = {
  text: 'Text',
  url: 'URL',
  file: 'File',
}

const TYPE_ICON: Record<Item['type'], string> = {
  text: '📝',
  url: '🔗',
  file: '📄',
  audio: '🎙️',
}

const STATUS_STYLE: Record<Item['status'], string> = {
  queued: 'bg-surface text-muted',
  processing: 'bg-accent-soft text-accent',
  done: 'bg-accent-soft text-accent',
  failed: 'bg-red-50 text-red-700',
}

const STATUS_LABEL: Record<Item['status'], string> = {
  queued: 'В очереди',
  processing: 'Обрабатывается',
  done: 'Готово',
  failed: 'Ошибка',
}

function preview(item: Item) {
  const text = item.type === 'text' ? item.rawContent : item.sourceUrl
  if (!text) return ''
  return text.length > 50 ? `${text.slice(0, 50)}…` : text
}

export function DashboardClient({ workspaceId }: { workspaceId: string }) {
  const [items, setItems] = useState<Item[]>([])
  const [mode, setMode] = useState<CaptureMode>('text')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadItems()
  }, [workspaceId])

  async function loadItems() {
    const res = await fetch(`/api/v1/items?workspaceId=${workspaceId}&limit=20`)
    if (!res.ok) return
    setItems(await res.json())
  }

  function resetComposer() {
    setText('')
    setUrl('')
    setFile(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'text') {
        if (!text.trim()) return
        await postItem({ workspaceId, type: 'text', rawContent: text.trim() })
      } else if (mode === 'url') {
        if (!url.trim()) return
        await postItem({ workspaceId, type: 'url', sourceUrl: url.trim() })
      } else {
        if (!file) return
        const form = new FormData()
        form.append('file', file)
        form.append('workspaceId', workspaceId)
        const uploadRes = await fetch('/api/v1/upload', { method: 'POST', body: form })
        if (!uploadRes.ok) throw new Error((await uploadRes.json()).error ?? 'Не удалось загрузить файл')
        const { path } = await uploadRes.json()
        await postItem({ workspaceId, type: 'file', sourceUrl: path })
      }
      resetComposer()
      await loadItems()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  async function postItem(body: Record<string, string>) {
    const res = await fetch('/api/v1/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? 'Не удалось сохранить')
  }

  const canSubmit =
    !busy && ((mode === 'text' && text.trim()) || (mode === 'url' && url.trim()) || (mode === 'file' && file))

  return (
    <div className="flex flex-1 flex-col gap-10">
      {/* Quick Capture */}
      <section className="w-full">
        <span className="font-label-caps text-label-caps text-muted mb-3 block">QUICK CAPTURE</span>
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-border bg-white p-3 focus-within:ring-2 focus-within:ring-accent/20 focus-within:border-accent transition-colors"
        >
          <div className="flex items-center gap-1 mb-3">
            {(['text', 'url', 'file'] as CaptureMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-lg px-3 py-1 text-xs font-ui-semibold transition-colors ${
                  mode === m ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface'
                }`}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>

          {mode === 'text' && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What's on your mind?"
              rows={3}
              className="w-full resize-none border-none bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-0"
            />
          )}
          {mode === 'url' && (
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a link..."
              className="w-full border-none bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-0"
            />
          )}
          {mode === 'file' && (
            <input
              type="file"
              accept=".pdf,.txt,.md"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-foreground"
            />
          )}

          <div className="flex items-center justify-end pt-3">
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-ui-semibold text-white shadow-sm transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {busy ? 'Сохраняем...' : 'Add'}
            </button>
          </div>
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>

      {/* Inbox list */}
      <section>
        <div className="mb-3 flex items-center justify-between px-1">
          <span className="font-label-caps text-label-caps text-muted">INBOX</span>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted px-1">Пока пусто — добавь первую заметку.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center rounded-[9px] border border-border bg-white p-3 gap-6 hover:bg-surface transition-colors"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface">
                  <span>{TYPE_ICON[item.type]}</span>
                </div>
                <span className="flex-1 truncate text-sm text-foreground">{preview(item)}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-ui-semibold shrink-0 ${STATUS_STYLE[item.status]}`}>
                  {STATUS_LABEL[item.status]}
                </span>
                <span className="font-mono text-[11px] text-muted shrink-0">
                  {new Date(item.createdAt).toLocaleString('ru-RU')}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
