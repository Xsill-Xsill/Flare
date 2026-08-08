'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useWorkspace } from '@/components/shell/WorkspaceContext'
import { SidebarToggleButton } from '@/components/shell/SidebarToggleButton'
import { useToast } from '@/components/shell/ToastProvider'
import { relativeTime } from '@/lib/format'

export type Item = {
  id: string
  type: 'text' | 'url' | 'file' | 'audio'
  rawContent: string | null
  sourceUrl: string | null
  status: 'queued' | 'processing' | 'done' | 'failed'
  createdAt: string
}

export const TYPE_ICON: Record<Item['type'], string> = {
  text: 'description',
  url: 'link',
  file: 'description',
  audio: 'mic',
}

export function itemTitle(item: Item) {
  const text = item.type === 'text' ? item.rawContent : item.sourceUrl
  if (!text) return 'Untitled'
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

function isUrl(value: string) {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function DashboardClient() {
  const workspace = useWorkspace()
  const showToast = useToast()

  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)

  const [text, setText] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)

  const [inboxOpen, setInboxOpen] = useState(false)
  const [inboxSearch, setInboxSearch] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  const [globalSearchFocused, setGlobalSearchFocused] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    loadItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the workspace changes, not on every loadItems identity change
  }, [workspace.id])

  async function loadItems() {
    setLoading(true)
    const res = await fetch(`/api/v1/items?workspaceId=${workspace.id}&limit=50`)
    if (res.ok) setItems(await res.json())
    setLoading(false)
  }

  async function postItem(body: Record<string, string>) {
    const res = await fetch('/api/v1/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to save')
  }

  function autoGrow() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  function removeFile(index: number) {
    setPendingFiles((files) => files.filter((_, i) => i !== index))
  }

  async function submitQuickCapture(e?: FormEvent) {
    e?.preventDefault()
    const trimmed = text.trim()
    if (!trimmed && pendingFiles.length === 0) {
      showToast("Write something before adding — empty notes don't get filed.", 'error')
      textareaRef.current?.focus()
      return
    }

    setSubmitting(true)
    try {
      if (trimmed) {
        if (isUrl(trimmed)) {
          await postItem({ workspaceId: workspace.id, type: 'url', sourceUrl: trimmed })
        } else {
          await postItem({ workspaceId: workspace.id, type: 'text', rawContent: trimmed })
        }
      }
      for (const file of pendingFiles) {
        const form = new FormData()
        form.append('file', file)
        form.append('workspaceId', workspace.id)
        const uploadRes = await fetch('/api/v1/upload', { method: 'POST', body: form })
        if (!uploadRes.ok) throw new Error((await uploadRes.json()).error ?? 'Failed to upload file')
        const { path } = await uploadRes.json()
        await postItem({ workspaceId: workspace.id, type: 'file', sourceUrl: path })
      }
      setText('')
      setPendingFiles([])
      requestAnimationFrame(autoGrow)
      await loadItems()
      showToast('Captured.', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Something went wrong', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const inboxItems = items
  const recentItems = items.slice(0, 3)
  const latestInsightAvailable = false // no insights backend yet

  const filteredInboxItems = useMemo(() => {
    const q = inboxSearch.trim().toLowerCase()
    if (!q) return inboxItems
    return inboxItems.filter((item) => itemTitle(item).toLowerCase().includes(q))
  }, [inboxItems, inboxSearch])

  const globalMatches = useMemo(() => {
    const q = globalSearch.trim().toLowerCase()
    if (!q) return []
    return items.filter((item) => itemTitle(item).toLowerCase().includes(q)).slice(0, 8)
  }, [items, globalSearch])

  return (
    <div className="p-lg max-w-[1280px] mx-auto w-full flex-1 flex flex-col gap-lg">
      {/* Utility row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <SidebarToggleButton />
          <div className="relative flex items-center gap-2 text-on-surface-variant w-full max-w-[20rem] min-w-0 pl-1">
            <span className="material-symbols-outlined text-[18px]">search</span>
            <input
              className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none p-0 text-sm placeholder:text-on-surface-variant"
              placeholder="Search your brain..."
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              onFocus={() => setGlobalSearchFocused(true)}
              onBlur={() => setTimeout(() => setGlobalSearchFocused(false), 150)}
            />
            {globalSearchFocused && globalSearch.trim() !== '' && (
              <div className="absolute left-0 top-[calc(100%+8px)] w-full max-w-[28rem] bg-white border border-outline-variant/60 rounded-lg shadow-lg px-3 py-2 z-50 max-h-80 overflow-y-auto">
                {globalMatches.length === 0 ? (
                  <span className="text-sm text-on-surface-variant">Not Found</span>
                ) : (
                  globalMatches.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 py-2 px-1 cursor-pointer rounded-md hover:bg-surface-container-highest transition-colors"
                      onMouseDown={() => {
                        setGlobalSearch('')
                        setInboxOpen(true)
                      }}
                    >
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant shrink-0">
                        {TYPE_ICON[item.type]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-on-surface truncate">{itemTitle(item)}</div>
                        <div className="text-xs text-outline truncate">Inbox</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-md shrink-0">
          <span className="hidden sm:inline font-metadata-mono text-metadata-mono text-on-surface-variant">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} ·{' '}
            {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Quick capture */}
      <section className="w-full">
        <span className="font-label-caps text-label-caps text-outline mb-sm block">QUICK CAPTURE</span>
        <form
          onSubmit={submitQuickCapture}
          className="rounded-xl flex flex-col p-sm group bg-white border border-outline-variant/60 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-[#0D9F6E] transition-colors"
        >
          <div className="flex items-start gap-sm">
            <div className="text-outline flex items-center pt-1">
              <span className="material-symbols-outlined text-[20px]">add</span>
            </div>
            <textarea
              ref={textareaRef}
              className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none resize-none font-body-md text-on-surface placeholder:text-outline py-1"
              placeholder="Capture a thought, URL, or idea..."
              rows={1}
              style={{ boxShadow: 'none' }}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                autoGrow()
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault()
                  submitQuickCapture()
                }
              }}
            />
          </div>
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-lg pt-sm">
              {pendingFiles.map((file, i) => (
                <span
                  key={`${file.name}-${i}`}
                  className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-md text-xs"
                  style={{ background: '#EEF2F0', color: '#1A2620' }}
                >
                  <span className="material-symbols-outlined text-[14px]" style={{ color: '#5C6F65' }}>
                    attach_file
                  </span>
                  <span className="max-w-[160px] truncate">{file.name}</span>
                  <button
                    aria-label="Remove"
                    className="material-symbols-outlined text-[14px] rounded-full flex items-center justify-center"
                    style={{ color: '#5C6F65', width: 16, height: 16 }}
                    type="button"
                    onClick={() => removeFile(i)}
                  >
                    close
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between pl-lg pt-sm">
            <div className="flex items-center gap-1">
              <input
                ref={fileInputRef}
                className="hidden"
                multiple
                type="file"
                accept=".pdf,.txt,.md"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  setPendingFiles((prev) => [...prev, ...files])
                  e.target.value = ''
                }}
              />
              <button
                aria-label="Add file"
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[#EEF2F0]"
                style={{ color: '#3d4a42' }}
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="material-symbols-outlined text-[18px]">attach_file</span>
              </button>
              <button
                aria-label="Voice"
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[#EEF2F0]"
                style={{ color: '#3d4a42' }}
                type="button"
                onClick={() => showToast('Voice capture is coming soon.', 'error')}
              >
                <span className="material-symbols-outlined text-[18px]">mic</span>
              </button>
            </div>
            <button
              className="bg-[#0D9F6E] hover:bg-primary text-white font-ui-semibold text-xs px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-1 active:scale-95 disabled:opacity-50"
              type="submit"
              disabled={submitting}
            >
              <span>{submitting ? 'Saving...' : 'Add'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Two-column grid: Insight + Inbox */}
      {loading ? (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
          <div className="lg:col-span-8">
            <div className="rounded-xl p-md h-full" style={{ background: '#EEF2F0', minHeight: 220 }}>
              <div className="h-3 w-28 rounded-full animate-pulse" style={{ background: '#D8E2DC' }} />
              <div className="h-6 w-full max-w-[28rem] rounded-lg animate-pulse mt-md" style={{ background: '#D8E2DC' }} />
              <div className="h-6 w-3/4 rounded-lg animate-pulse mt-2" style={{ background: '#D8E2DC' }} />
              <div className="h-9 w-32 rounded-lg animate-pulse mt-xl" style={{ background: '#D8E2DC' }} />
            </div>
          </div>
          <div className="lg:col-span-4">
            <div className="rounded-xl p-md h-full" style={{ background: '#EEF2F0', minHeight: 220 }}>
              <div className="h-3 w-16 rounded-full animate-pulse" style={{ background: '#D8E2DC' }} />
              <div className="h-9 w-20 rounded-lg animate-pulse mt-md" style={{ background: '#D8E2DC' }} />
              <div className="h-10 w-full rounded-lg animate-pulse mt-lg" style={{ background: '#D8E2DC' }} />
              <div className="h-10 w-full rounded-lg animate-pulse mt-2" style={{ background: '#D8E2DC' }} />
              <div className="h-10 w-full rounded-lg animate-pulse mt-2" style={{ background: '#D8E2DC' }} />
            </div>
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
          {/* Insight hero */}
          <div className="lg:col-span-8 flex flex-col h-full">
            <div className="insight-card-accent rounded-xl p-md flex flex-col h-full justify-between group hover:shadow-lg transition-all duration-300">
              {latestInsightAvailable ? null : (
                <div className="flex flex-col h-full items-start justify-center">
                  <div className="flex items-center gap-2 mb-md">
                    <span className="w-2 h-2 rounded-full bg-[#0D9F6E]" />
                    <span className="font-label-caps text-label-caps text-[#0D9F6E]">LATEST INSIGHT</span>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    Insights will appear here once your daily review has run over a few captures.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Inbox card */}
          <div className="lg:col-span-4 flex flex-col h-full">
            <div className="card-flat rounded-xl p-md flex flex-col h-full">
              <div className="flex justify-between items-center mb-md">
                <span className="font-label-caps text-label-caps text-outline">INBOX</span>
                <button
                  className="font-ui-semibold text-sm text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-1"
                  type="button"
                  onClick={() => setInboxOpen(true)}
                >
                  Open <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </button>
              </div>
              <div className="flex items-baseline gap-2 mb-lg">
                <span
                  className="font-display-lg text-display-lg text-on-surface"
                  style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}
                >
                  {inboxItems.length}
                </span>
                <span className="font-ui-semibold text-on-surface-variant text-sm">items to sort</span>
              </div>
              <div className="flex flex-col gap-sm flex-1 justify-end">
                {inboxItems.length === 0 ? (
                  <p className="text-sm text-outline">Nothing here yet — capture a thought above.</p>
                ) : (
                  inboxItems.slice(0, 4).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-sm rounded-lg bg-surface-container-lowest/50 hover:bg-surface-container-lowest border border-transparent hover:border-outline-variant/50 transition-all cursor-pointer group"
                      onClick={() => setInboxOpen(true)}
                    >
                      <div className="flex items-center gap-sm overflow-hidden">
                        <span className="w-8 h-8 flex items-center justify-center rounded-md bg-surface-container-highest shrink-0">
                          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                            {TYPE_ICON[item.type]}
                          </span>
                        </span>
                        <span className="font-ui-semibold text-sm text-on-surface truncate">{itemTitle(item)}</span>
                      </div>
                      <span className="material-symbols-outlined text-outline group-hover:text-on-surface text-[16px] opacity-0 group-hover:opacity-100 transition-opacity">
                        arrow_forward
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Recent */}
      <section className="mt-md">
        <div className="flex justify-between items-center mb-md px-xs">
          <span className="font-label-caps text-label-caps text-outline">RECENT</span>
        </div>
        {recentItems.length === 0 ? (
          <p className="text-sm text-outline px-xs">No captures yet.</p>
        ) : (
          <div className="flex flex-col gap-xs">
            {recentItems.map((item) => (
              <div
                key={item.id}
                className="card-flat p-sm rounded-[9px] flex items-center hover:bg-surface-container-low transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-md">
                  <div className="w-8 h-8 flex items-center justify-center bg-surface-container-highest rounded-md">
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                      {TYPE_ICON[item.type]}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-ui-semibold text-[12px] text-on-surface group-hover:text-primary transition-colors">
                      {itemTitle(item)}
                    </span>
                    <span className="font-metadata-mono text-metadata-mono text-[10px] text-outline mt-[2px]">
                      {relativeTime(item.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Inbox overlay */}
      {inboxOpen && (
        <div className="fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 opacity-100 transition-opacity duration-300 ease-out"
            style={{ background: 'rgba(26,38,32,0.5)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            onClick={() => setInboxOpen(false)}
          />
          <div
            className="absolute right-0 top-0 h-full w-full sm:w-[640px] bg-white flex flex-col transition-transform duration-300 ease-out"
            style={{ boxShadow: '-8px 0 32px rgba(26,38,32,0.14)', transform: 'translateX(0)' }}
          >
            <div className="flex items-center justify-between gap-md px-lg py-md" style={{ borderBottom: '1px solid #D8E2DC' }}>
              <div className="flex items-center gap-sm min-w-0">
                <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-on-surface-variant" style={{ fontVariationSettings: '"FILL" 1' }}>
                    inbox
                  </span>
                </div>
                <div className="min-w-0">
                  <h2 className="font-ui-semibold truncate" style={{ color: '#1A2620', fontSize: 16 }}>
                    Inbox
                  </h2>
                  <p className="text-xs truncate" style={{ color: '#5C6F65' }}>
                    {inboxItems.length} items · Needs sorting
                  </p>
                </div>
              </div>
              <button
                aria-label="Close"
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors active:scale-95 hover:bg-[#EEF2F0]"
                style={{ color: '#5C6F65' }}
                onClick={() => setInboxOpen(false)}
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="px-lg py-sm" style={{ borderBottom: '1px solid #D8E2DC' }}>
              <div className="relative">
                <span
                  className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px]"
                  style={{ color: '#5C6F65' }}
                >
                  search
                </span>
                <input
                  className="w-full pl-10 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 transition-all"
                  placeholder="Search in Inbox..."
                  style={{ background: '#EEF2F0', border: '1px solid #D8E2DC', color: '#1A2620' }}
                  type="text"
                  value={inboxSearch}
                  onChange={(e) => setInboxSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredInboxItems.length === 0 ? (
                <p className="text-sm text-outline px-lg py-md">Nothing found.</p>
              ) : (
                filteredInboxItems.map((item, i) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-lg cursor-pointer transition-colors hover:bg-[#EEF2F0]"
                    style={{
                      height: 64,
                      borderBottom: i === filteredInboxItems.length - 1 ? 'none' : '1px solid #D8E2DC',
                    }}
                  >
                    <div className="w-9 h-9 rounded-lg bg-surface-container-highest flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                        {TYPE_ICON[item.type]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-ui-semibold text-sm truncate" style={{ color: '#1A2620' }}>
                          {itemTitle(item)}
                        </span>
                        <span className="font-metadata-mono text-metadata-mono text-[11px] shrink-0" style={{ color: '#5C6F65' }}>
                          {relativeTime(item.createdAt)}
                        </span>
                      </div>
                      <div className="mt-[2px]">
                        <span className="text-xs truncate block" style={{ color: '#5C6F65' }}>
                          Captured, not yet filed into a folder
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
