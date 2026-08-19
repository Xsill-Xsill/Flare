'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useWorkspace } from '@/components/shell/WorkspaceContext'
import { SidebarToggleButton } from '@/components/shell/SidebarToggleButton'
import { useToast } from '@/components/shell/ToastProvider'
import { relativeTime } from '@/lib/format'
import { itemTitle, TYPE_ICON, type Item } from '../dashboard/DashboardClient'

type Chip = 'all' | 'folders' | 'notes'

type InboxItem = Item
type VaultItem = Item & { claims: string[]; folder: string | null; hideFromAi: boolean; tags: string[] }

type ItemDetail = Item & {
  claims: { id: string; statement: string; createdAt: string }[]
  tags: string[]
  folder: string | null
  hideFromAi: boolean
  sourcePreview: string
}

function isUrl(value: string) {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function VaultClient() {
  const workspace = useWorkspace()
  const showToast = useToast()

  const [inboxItems, setInboxItems] = useState<InboxItem[]>([])
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([])
  const [filterQuery, setFilterQuery] = useState('')
  const [vaultLoading, setVaultLoading] = useState(true)
  const [activeChip, setActiveChip] = useState<Chip>('all')
  const [inboxOpen, setInboxOpen] = useState(false)
  const [inboxSearch, setInboxSearch] = useState('')

  const [folders, setFolders] = useState<string[]>([])
  const [selectedFolder, setSelectedFolder] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFolder, setEditFolder] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])
  const [editTagInput, setEditTagInput] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<VaultItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ItemDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [newNoteOpen, setNewNoteOpen] = useState(false)
  const [newNoteTitle, setNewNoteTitle] = useState('')
  const [newNoteText, setNewNoteText] = useState('')
  const [creatingNote, setCreatingNote] = useState(false)
  const [newNoteFile, setNewNoteFile] = useState<File | null>(null)
  const [newNoteHideFromAi, setNewNoteHideFromAi] = useState(false)
  const [newNoteTags, setNewNoteTags] = useState<string[]>([])
  const [newNoteTagInput, setNewNoteTagInput] = useState('')
  const [recording, setRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [transcribing, setTranscribing] = useState(false)
  const [relatedNotes, setRelatedNotes] = useState<VaultItem[]>([])
  const [relatedLoading, setRelatedLoading] = useState(false)

  const newNoteFileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recordingTimerRef = useRef<number | null>(null)

  useEffect(() => {
    loadInboxItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the workspace changes, not on every loadInboxItems identity change
  }, [workspace.id])

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current)
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  // Related notes: debounced semantic search against the note body as the user types.
  useEffect(() => {
    if (!newNoteOpen) return
    const query = newNoteText.trim()
    if (query.length < 15) {
      const frame = requestAnimationFrame(() => setRelatedNotes([]))
      return () => cancelAnimationFrame(frame)
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setRelatedLoading(true)
      try {
        const params = new URLSearchParams({ workspaceId: workspace.id, q: query, limit: '4' })
        const res = await fetch(`/api/v1/vault?${params.toString()}`, { signal: controller.signal })
        const data: unknown = res.ok ? await res.json() : []
        if (!controller.signal.aborted) setRelatedNotes(Array.isArray(data) ? (data as VaultItem[]) : [])
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setRelatedNotes([])
      } finally {
        if (!controller.signal.aborted) setRelatedLoading(false)
      }
    }, 500)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [newNoteText, newNoteOpen, workspace.id])

  async function loadInboxItems() {
    try {
      const res = await fetch(`/api/v1/items?workspaceId=${workspace.id}&limit=100`)
      const data = res.ok ? await res.json() : []
      setInboxItems(Array.isArray(data) ? data : [])
    } catch {
      setInboxItems([])
    }
  }

  useEffect(() => {
    fetch(`/api/v1/vault/folders?workspaceId=${workspace.id}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setFolders(Array.isArray(data) ? data : []))
      .catch(() => setFolders([]))
  }, [workspace.id])

  useEffect(() => {
    const controller = new AbortController()
    const search = filterQuery.trim()
    const timer = window.setTimeout(
      async () => {
        setVaultLoading(true)
        try {
          const params = new URLSearchParams({ workspaceId: workspace.id, limit: '20' })
          if (search) params.set('q', search)
          if (selectedFolder) params.set('folder', selectedFolder)
          const response = await fetch(`/api/v1/vault?${params.toString()}`, { signal: controller.signal })
          const data: unknown = response.ok ? await response.json() : []
          if (!controller.signal.aborted) setVaultItems(Array.isArray(data) ? data as VaultItem[] : [])
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'AbortError')) setVaultItems([])
        } finally {
          if (!controller.signal.aborted) setVaultLoading(false)
        }
      },
      search ? 300 : 0
    )

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [filterQuery, selectedFolder, workspace.id])

  const filteredInboxItems = useMemo(() => {
    const q = inboxSearch.trim().toLowerCase()
    if (!q) return inboxItems
    return inboxItems.filter((item) => itemTitle(item).toLowerCase().includes(q))
  }, [inboxItems, inboxSearch])

  function stopRecordingTimer() {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
  }

  function resetNewNoteState() {
    if (recording) mediaRecorderRef.current?.stop()
    stopRecordingTimer()
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
    recordingStreamRef.current = null
    setRecording(false)
    setRecordingSeconds(0)
    setTranscribing(false)
    setNewNoteOpen(false)
    setNewNoteTitle('')
    setNewNoteText('')
    setNewNoteFile(null)
    setNewNoteHideFromAi(false)
    setNewNoteTags([])
    setNewNoteTagInput('')
    setRelatedNotes([])
  }

  function closeNewNote() {
    if (creatingNote) return
    resetNewNoteState()
  }

  function formatDuration(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
    const seconds = (totalSeconds % 60).toString().padStart(2, '0')
    return `${minutes}:${seconds}`
  }

  async function transcribeRecording(blob: Blob) {
    setTranscribing(true)
    try {
      const form = new FormData()
      form.append('audio', blob, 'recording.webm')
      const res = await fetch('/api/v1/transcribe', { method: 'POST', body: form })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Failed to transcribe')
      setNewNoteText((prev) => (prev.trim() ? `${prev.trim()}\n\n${body.text}` : body.text))
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Не удалось распознать речь', 'error')
    } finally {
      setTranscribing(false)
    }
  }

  async function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop()
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      showToast('Не удалось получить доступ к микрофону — проверь разрешения браузера.', 'error')
      return
    }

    recordingStreamRef.current = stream
    audioChunksRef.current = []

    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' })
      stream.getTracks().forEach((track) => track.stop())
      recordingStreamRef.current = null
      stopRecordingTimer()
      setRecording(false)
      setRecordingSeconds(0)
      void transcribeRecording(blob)
    }

    mediaRecorderRef.current = recorder
    recorder.start()
    setRecording(true)
    setRecordingSeconds(0)
    recordingTimerRef.current = window.setInterval(() => setRecordingSeconds((s) => s + 1), 1000)
  }

  function commitNewNoteTag() {
    const value = newNoteTagInput.trim()
    if (!value) return
    setNewNoteTags((tags) => (tags.includes(value) ? tags : [...tags, value]))
    setNewNoteTagInput('')
  }

  function handleNewNoteTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commitNewNoteTag()
    }
  }

  function removeNewNoteTag(tag: string) {
    setNewNoteTags((tags) => tags.filter((t) => t !== tag))
  }

  async function submitNewNote() {
    const title = newNoteTitle.trim()
    const text = newNoteText.trim()
    const rawContent = title && text ? `${title}\n\n${text}` : title || text
    if (!rawContent && !newNoteFile) return

    setCreatingNote(true)
    try {
      let sourceUrl: string | null = null
      if (newNoteFile) {
        const form = new FormData()
        form.append('file', newNoteFile)
        form.append('workspaceId', workspace.id)
        const uploadRes = await fetch('/api/v1/upload', { method: 'POST', body: form })
        if (!uploadRes.ok) throw new Error((await uploadRes.json().catch(() => ({}))).error ?? 'Failed to upload file')
        sourceUrl = (await uploadRes.json()).path
      }

      // A bare URL with no title and no file attached is captured as type=url (scraped for
      // text); everything else — text alone, text + file, or file alone — is type=text/file
      // with the file (if any) riding along as sourceUrl on the same item.
      const payload =
        !title && !newNoteFile && isUrl(text)
          ? { workspaceId: workspace.id, type: 'url', sourceUrl: text, hideFromAi: newNoteHideFromAi }
          : {
              workspaceId: workspace.id,
              type: rawContent ? 'text' : 'file',
              rawContent: rawContent || undefined,
              sourceUrl: sourceUrl || undefined,
              hideFromAi: newNoteHideFromAi,
            }

      const res = await fetch('/api/v1/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to save')
      const created = await res.json()

      const tagsToSave = Array.from(new Set([...newNoteTags, ...(newNoteTagInput.trim() ? [newNoteTagInput.trim()] : [])]))
      if (tagsToSave.length > 0) {
        await fetch(`/api/v1/vault/${created.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: tagsToSave }),
        }).catch(() => undefined) // tags are a nice-to-have; a failure here shouldn't undo the note itself
      }

      resetNewNoteState()
      await loadInboxItems()
      showToast('Captured.', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save', 'error')
    } finally {
      setCreatingNote(false)
    }
  }

  function startEdit(item: VaultItem) {
    setEditingId(item.id)
    setEditFolder(item.folder ?? '')
    setEditTags(item.tags)
    setEditTagInput('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditTagInput('')
  }

  function commitTagInput() {
    const value = editTagInput.trim()
    if (!value) return
    setEditTags((tags) => (tags.includes(value) ? tags : [...tags, value]))
    setEditTagInput('')
  }

  function handleTagInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commitTagInput()
    }
  }

  function removeEditTag(tag: string) {
    setEditTags((tags) => tags.filter((t) => t !== tag))
  }

  async function saveEdit(itemId: string) {
    setSavingEdit(true)
    try {
      const tags = editTagInput.trim() ? [...editTags, editTagInput.trim()] : editTags
      const res = await fetch(`/api/v1/vault/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: editFolder.trim() || null, tags }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to save')
      const updated: { folder: string | null; tags: string[] } = await res.json()
      setVaultItems((items) =>
        items.map((it) => (it.id === itemId ? { ...it, folder: updated.folder, tags: updated.tags } : it))
      )
      if (updated.folder && !folders.includes(updated.folder)) {
        setFolders((f) => [...f, updated.folder as string].sort())
      }
      setEditingId(null)
      setEditTagInput('')
      showToast('Saved', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save', 'error')
    } finally {
      setSavingEdit(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/v1/vault/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to delete')
      setVaultItems((items) => items.filter((it) => it.id !== deleteTarget.id))
      if (detailId === deleteTarget.id) {
        setDetailId(null)
        setDetail(null)
      }
      showToast('Item deleted', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete', 'error')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  async function openDetail(itemId: string) {
    setDetailId(itemId)
    setDetail(null)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/v1/vault/${itemId}`)
      if (!res.ok) throw new Error('Failed to load item')
      setDetail(await res.json())
    } catch {
      showToast('Failed to load item', 'error')
      setDetailId(null)
    } finally {
      setDetailLoading(false)
    }
  }

  function closeDetail() {
    setDetailId(null)
    setDetail(null)
  }

  return (
    <div className="p-lg max-w-[1280px] mx-auto w-full flex-1 flex flex-col gap-lg">
      {/* 0. UTILITY ROW */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <SidebarToggleButton />
        </div>
        <div className="flex items-center gap-md shrink-0">
          <span className="hidden sm:inline font-metadata-mono text-metadata-mono text-on-surface-variant">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} ·{' '}
            {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button
            className="text-on-surface-variant hover:text-primary transition-all active:opacity-80 p-sm rounded-full hover:bg-surface-container-highest"
            type="button"
            onClick={() => setNewNoteOpen(true)}
          >
            <span className="material-symbols-outlined">add_circle</span>
          </button>
        </div>
      </div>

      {/* 0.5 INBOX + NEW NOTE ACTION ROW */}
      <div className="flex items-center justify-between pb-md border-b border-outline-variant/40">
        <button
          className="flex items-center gap-2 text-on-surface font-ui-semibold text-ui-semibold hover:text-primary transition-colors group"
          type="button"
          onClick={() => setInboxOpen(true)}
        >
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant group-hover:text-primary transition-colors">
            inbox
          </span>
          Inbox
          <span className="bg-surface-container-highest text-on-surface-variant px-2 py-[2px] rounded-full text-xs font-bold">
            {inboxItems.length > 0 ? inboxItems.length : '…'}
          </span>
        </button>
        <button
          className="bg-[#0D9F6E] hover:bg-primary text-white font-ui-semibold text-sm px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-1 active:scale-95"
          type="button"
          onClick={() => setNewNoteOpen(true)}
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Note
        </button>
      </div>

      {/* 1. PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display-sm text-display-sm text-on-surface" style={{ fontWeight: 800 }}>
            Vault
          </h1>
        </div>
      </div>

      {/* 2. FILTER BAR */}
      <div className="flex flex-col md:flex-row gap-3 items-center">
        <div className="relative flex-1 w-full">
          {vaultLoading ? (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-outline-variant border-t-[#0D9F6E] animate-spin" />
          ) : (
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">
              search
            </span>
          )}
          <input
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-outline-variant/60 rounded-lg text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-[#0D9F6E] transition-all font-body-md text-sm"
            placeholder="Search your Vault (semantic)…"
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
          />
        </div>

        <select
          className="w-full md:w-auto shrink-0 px-3 py-2.5 bg-white border border-outline-variant/60 rounded-lg text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
          value={selectedFolder}
          onChange={(e) => setSelectedFolder(e.target.value)}
        >
          <option value="">All folders</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <div className="flex overflow-x-auto pb-2 md:pb-0 w-full md:w-auto hide-scrollbar gap-2">
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'folders', label: 'Folders' },
              { key: 'notes', label: 'Notes' },
            ] as { key: Chip; label: string }[]
          ).map((chip) => {
            const isActive = chip.key === activeChip
            return (
              <button
                key={chip.key}
                className={`px-4 py-1.5 rounded-full font-ui-semibold text-sm whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-[#0D9F6E] text-white shadow-sm'
                    : 'bg-white border border-outline-variant/60 text-on-surface-variant hover:bg-surface-container-highest'
                }`}
                type="button"
                onClick={() => setActiveChip(chip.key)}
              >
                {chip.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* 3. FOLDER GRID (empty state when there's nothing to show) */}
      {!vaultLoading && vaultItems.length === 0 && (
        <div className="rounded-xl border border-dashed border-outline-variant/60 py-xl px-md flex flex-col items-center justify-center text-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>
              folder
            </span>
          </div>
          <p className="font-ui-semibold text-sm text-on-surface">Nothing in your Vault yet</p>
          <p className="text-xs text-outline w-full max-w-[24rem]">
            Items land here once they&apos;ve been sorted out of your Inbox.
          </p>
        </div>
      )}

      {/* 4. RECENTLY ADDED */}
      <section className="mt-md">
        <div className="flex justify-between items-center mb-md px-xs">
          <span className="font-label-caps text-label-caps text-outline">RECENTLY ADDED</span>
        </div>
        {vaultLoading ? (
          <div className="space-y-2 px-xs">
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-[72px] rounded-xl animate-pulse bg-surface-container-highest" />
            ))}
          </div>
        ) : vaultItems.length === 0 ? (
          <p className="text-sm text-outline px-xs">No items yet.</p>
        ) : (
          <div className="space-y-2 px-xs">
            {vaultItems.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-outline-variant/60 bg-white px-md py-3 cursor-pointer hover:border-[#0D9F6E]/50 transition-colors"
                onClick={() => openDetail(item.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-surface-container-highest flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant">{TYPE_ICON[item.type]}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="font-ui-semibold text-sm text-on-surface truncate">{itemTitle(item)}</h2>
                      {item.hideFromAi && (
                        <span
                          aria-label="Hidden from AI"
                          className="material-symbols-outlined text-[14px] shrink-0"
                          style={{ color: '#0D9F6E' }}
                          title="Hidden from AI"
                        >
                          visibility_off
                        </span>
                      )}
                      {item.status !== 'done' && (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-ui-semibold ${
                          item.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-surface-container-highest text-on-surface-variant'
                        }`}>
                          {item.status === 'failed' ? 'failed' : 'processing…'}
                        </span>
                      )}
                      {item.folder && (
                        <span className="shrink-0 flex items-center gap-1 rounded-full bg-surface-container-highest px-2 py-0.5 text-[11px] font-ui-semibold text-on-surface-variant">
                          <span className="material-symbols-outlined text-[12px]">folder</span>
                          {item.folder}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 font-metadata-mono text-[11px] text-on-surface-variant">{relativeTime(item.createdAt)}</p>
                    {item.claims.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.claims.slice(0, 2).map((claim) => (
                          <span key={claim} className="max-w-full truncate rounded-md bg-surface-container-highest px-2 py-1 text-xs text-on-surface-variant">
                            {claim.length > 80 ? `${claim.slice(0, 80)}…` : claim}
                          </span>
                        ))}
                      </div>
                    )}
                    {item.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-primary/10 text-[#0D9F6E] px-2 py-0.5 text-[11px] font-ui-semibold">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {editingId === item.id && (
                      <div
                        className="mt-3 rounded-lg border border-outline-variant/60 bg-surface-container-highest/60 p-3 flex flex-col gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label className="text-[11px] font-ui-semibold text-on-surface-variant">Folder</label>
                        <input
                          className="w-full px-2.5 py-1.5 bg-white border border-outline-variant/60 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="e.g. Work / Reading"
                          type="text"
                          value={editFolder}
                          onChange={(e) => setEditFolder(e.target.value)}
                        />
                        <label className="text-[11px] font-ui-semibold text-on-surface-variant mt-1">Tags</label>
                        <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 bg-white border border-outline-variant/60 rounded-md">
                          {editTags.map((tag) => (
                            <span key={tag} className="flex items-center gap-1 rounded-full bg-primary/10 text-[#0D9F6E] px-2 py-0.5 text-[11px] font-ui-semibold">
                              #{tag}
                              <button type="button" onClick={() => removeEditTag(tag)} aria-label={`Remove ${tag}`}>
                                <span className="material-symbols-outlined text-[13px]">close</span>
                              </button>
                            </span>
                          ))}
                          <input
                            className="flex-1 min-w-[80px] border-none focus:outline-none focus:ring-0 text-sm p-0"
                            placeholder="Add tag, press Enter"
                            type="text"
                            value={editTagInput}
                            onChange={(e) => setEditTagInput(e.target.value)}
                            onKeyDown={handleTagInputKeyDown}
                            onBlur={commitTagInput}
                          />
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            type="button"
                            className="bg-[#0D9F6E] hover:bg-primary text-white font-ui-semibold text-xs px-3 py-1.5 rounded-md transition-colors disabled:opacity-60"
                            disabled={savingEdit}
                            onClick={() => saveEdit(item.id)}
                          >
                            {savingEdit ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            className="text-on-surface-variant hover:text-on-surface font-ui-semibold text-xs px-3 py-1.5 rounded-md transition-colors"
                            onClick={cancelEdit}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      aria-label="Edit folder and tags"
                      className="text-on-surface-variant hover:text-primary transition-colors p-1.5 rounded-full hover:bg-surface-container-highest"
                      onClick={() => (editingId === item.id ? cancelEdit() : startEdit(item))}
                    >
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button
                      type="button"
                      aria-label="Delete item"
                      className="text-on-surface-variant hover:text-red-600 transition-colors p-1.5 rounded-full hover:bg-red-50"
                      onClick={() => setDeleteTarget(item)}
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Inbox overlay */}
      {inboxOpen && (
        <div className="fixed inset-0 z-[60]">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(26,38,32,0.5)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            onClick={() => setInboxOpen(false)}
          />
          <div
            className="absolute right-0 top-0 h-full w-full sm:w-[640px] bg-white flex flex-col"
            style={{ boxShadow: '-8px 0 32px rgba(26,38,32,0.14)' }}
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
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px]" style={{ color: '#5C6F65' }}>
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

      {/* Item detail sheet */}
      {detailId && (
        <div className="fixed inset-0 z-[70]">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(26,38,32,0.5)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            onClick={closeDetail}
          />
          <div
            className="absolute right-0 top-0 h-full w-full sm:w-[560px] bg-white flex flex-col"
            style={{ boxShadow: '-8px 0 32px rgba(26,38,32,0.14)' }}
          >
            <div className="flex items-center justify-between gap-md px-lg py-md" style={{ borderBottom: '1px solid #D8E2DC' }}>
              <h2 className="font-ui-semibold truncate" style={{ color: '#1A2620', fontSize: 16 }}>
                Item details
              </h2>
              <button
                aria-label="Close"
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors active:scale-95 hover:bg-[#EEF2F0]"
                style={{ color: '#5C6F65' }}
                onClick={closeDetail}
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-lg py-lg">
              {detailLoading || !detail ? (
                <div className="space-y-3">
                  {[0, 1, 2].map((row) => (
                    <div key={row} className="h-6 rounded-md animate-pulse bg-surface-container-highest" />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-lg">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-on-surface-variant text-[18px]">
                        {TYPE_ICON[detail.type]}
                      </span>
                      <h3 className="font-ui-semibold text-base text-on-surface break-words">{itemTitle(detail)}</h3>
                      {detail.hideFromAi && (
                        <span
                          aria-label="Hidden from AI"
                          className="material-symbols-outlined text-[16px] shrink-0"
                          style={{ color: '#0D9F6E' }}
                          title="Hidden from AI"
                        >
                          visibility_off
                        </span>
                      )}
                    </div>
                    <p className="mt-1 font-metadata-mono text-[11px] text-on-surface-variant">
                      {new Date(detail.createdAt).toLocaleString()}
                    </p>
                    {detail.sourceUrl && (
                      <a
                        href={detail.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs text-[#0D9F6E] hover:underline break-all"
                      >
                        {detail.sourceUrl}
                      </a>
                    )}
                  </div>

                  {(detail.folder || detail.tags.length > 0) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {detail.folder && (
                        <span className="flex items-center gap-1 rounded-full bg-surface-container-highest px-2 py-0.5 text-[11px] font-ui-semibold text-on-surface-variant">
                          <span className="material-symbols-outlined text-[12px]">folder</span>
                          {detail.folder}
                        </span>
                      )}
                      {detail.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-primary/10 text-[#0D9F6E] px-2 py-0.5 text-[11px] font-ui-semibold">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div>
                    <span className="font-label-caps text-label-caps text-outline">SOURCE PREVIEW</span>
                    <p className="mt-2 text-sm text-on-surface whitespace-pre-wrap break-words">
                      {detail.sourcePreview || 'No content available.'}
                    </p>
                  </div>

                  <div>
                    <span className="font-label-caps text-label-caps text-outline">CLAIMS ({detail.claims.length})</span>
                    {detail.claims.length === 0 ? (
                      <p className="mt-2 text-sm text-outline">No claims extracted yet.</p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {detail.claims.map((claim) => (
                          <div key={claim.id} className="rounded-md bg-surface-container-highest px-3 py-2 text-sm text-on-surface">
                            {claim.statement}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(26,38,32,0.5)' }}
            onClick={() => (!deleting ? setDeleteTarget(null) : undefined)}
          />
          <div className="relative bg-white rounded-xl w-full max-w-[420px] p-lg shadow-lg flex flex-col gap-3">
            <h3 className="font-ui-semibold text-base text-on-surface">Delete this item?</h3>
            <p className="text-sm text-on-surface-variant">
              &ldquo;{itemTitle(deleteTarget)}&rdquo; and its extracted claims will be permanently removed. This can&apos;t be
              undone.
            </p>
            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                type="button"
                className="text-on-surface-variant hover:text-on-surface font-ui-semibold text-sm px-3 py-2 rounded-md transition-colors disabled:opacity-60"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="bg-red-600 hover:bg-red-700 text-white font-ui-semibold text-sm px-3 py-2 rounded-md transition-colors disabled:opacity-60"
                disabled={deleting}
                onClick={confirmDelete}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New note editor — right-side sheet, matches design/vault_page.html's note-editor */}
      {newNoteOpen && (
        <div className="fixed inset-0 z-[80]">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(26,38,32,0.5)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            onClick={closeNewNote}
          />
          <div
            className="absolute right-0 top-0 h-full w-full sm:w-[640px] bg-white flex flex-col"
            style={{ boxShadow: '-8px 0 32px rgba(26,38,32,0.14)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-md px-lg py-md" style={{ borderBottom: '1px solid #D8E2DC' }}>
              <input
                autoFocus
                className="flex-1 min-w-0 bg-transparent border-none focus:outline-none focus:ring-0 p-0 font-ui-semibold"
                placeholder="Untitled note"
                style={{ color: '#1A2620', fontSize: 16 }}
                type="text"
                value={newNoteTitle}
                onChange={(e) => setNewNoteTitle(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault()
                    submitNewNote()
                  }
                }}
              />
              <button
                aria-label="Close"
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors active:scale-95 shrink-0 hover:bg-[#EEF2F0]"
                style={{ color: '#5C6F65' }}
                type="button"
                onClick={closeNewNote}
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap items-center gap-1.5 px-lg pt-sm">
              {newNoteTags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded px-2 py-[2px] text-[11px] font-ui-semibold"
                  style={{ background: '#EEF2F0', color: '#5C6F65' }}
                >
                  {tag}
                  <button type="button" onClick={() => removeNewNoteTag(tag)} aria-label={`Remove ${tag}`}>
                    <span className="material-symbols-outlined text-[13px]">close</span>
                  </button>
                </span>
              ))}
              <input
                className="min-w-[100px] flex-1 border-none bg-transparent text-xs focus:outline-none focus:ring-0 p-0"
                placeholder="Add tag, press Enter"
                style={{ color: '#1A2620' }}
                type="text"
                value={newNoteTagInput}
                onChange={(e) => setNewNoteTagInput(e.target.value)}
                onKeyDown={handleNewNoteTagKeyDown}
                onBlur={commitNewNoteTag}
              />
            </div>

            {/* Related notes */}
            {(relatedLoading || relatedNotes.length > 0) && (
              <div className="px-lg pt-sm">
                <p className="font-label-caps text-label-caps mb-1" style={{ color: '#5C6F65' }}>
                  RELATED
                </p>
                <div className="flex gap-sm overflow-x-auto hide-scrollbar">
                  {relatedLoading ? (
                    <div className="w-[180px] h-[52px] rounded-lg animate-pulse shrink-0" style={{ background: '#EEF2F0' }} />
                  ) : (
                    relatedNotes.map((note) => (
                      <div
                        key={note.id}
                        className="shrink-0 rounded-lg p-sm cursor-pointer transition-colors"
                        style={{ width: 180, background: '#FFFFFF', border: '1px solid #D8E2DC' }}
                        onMouseOver={(e) => (e.currentTarget.style.background = '#EEF2F0')}
                        onMouseOut={(e) => (e.currentTarget.style.background = '#FFFFFF')}
                        onClick={() => {
                          closeNewNote()
                          openDetail(note.id)
                        }}
                      >
                        <div className="flex items-center gap-1 mb-1">
                          <span className="material-symbols-outlined text-[12px]" style={{ color: '#5C6F65' }}>
                            {TYPE_ICON[note.type]}
                          </span>
                          <span
                            className="text-[10px] font-ui-semibold uppercase tracking-wider"
                            style={{ color: '#5C6F65' }}
                          >
                            {note.folder || 'Vault'}
                          </span>
                        </div>
                        <div className="text-xs font-ui-semibold leading-snug truncate" style={{ color: '#1A2620' }}>
                          {itemTitle(note)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Toolbar */}
            <div className="flex items-center gap-1 px-lg py-sm" style={{ borderBottom: '1px solid #D8E2DC' }}>
              <input
                ref={newNoteFileInputRef}
                className="hidden"
                type="file"
                accept=".pdf,.txt,.md"
                onChange={(e) => {
                  setNewNoteFile(e.target.files?.[0] ?? null)
                  e.target.value = ''
                }}
              />
              <button
                aria-label="Add file"
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[#EEF2F0] disabled:opacity-50"
                style={{ color: '#1A2620' }}
                type="button"
                disabled={Boolean(newNoteFile)}
                onClick={() => newNoteFileInputRef.current?.click()}
              >
                <span className="material-symbols-outlined text-[18px]">attach_file</span>
              </button>
              <button
                aria-label={recording ? 'Stop recording' : 'Record voice note'}
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors disabled:opacity-50"
                style={{ background: recording ? '#ba1a1a' : 'transparent', color: recording ? '#ffffff' : '#1A2620' }}
                type="button"
                disabled={transcribing}
                onClick={toggleRecording}
              >
                <span className="material-symbols-outlined text-[18px]">mic</span>
              </button>
              {recording && (
                <span className="flex items-center gap-1 pl-1">
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#ba1a1a' }} />
                  <span className="text-xs font-metadata-mono" style={{ color: '#ba1a1a' }}>
                    {formatDuration(recordingSeconds)}
                  </span>
                </span>
              )}
              {transcribing && (
                <span className="flex items-center gap-1 pl-1">
                  <span
                    className="w-3 h-3 rounded-full border-2 border-outline-variant animate-spin"
                    style={{ borderTopColor: '#0D9F6E' }}
                  />
                  <span className="text-xs font-metadata-mono" style={{ color: '#5C6F65' }}>
                    Распознаём речь…
                  </span>
                </span>
              )}
              <button
                aria-pressed={newNoteHideFromAi}
                className="ml-auto flex items-center gap-2"
                type="button"
                onClick={() => setNewNoteHideFromAi((v) => !v)}
              >
                <span
                  className="material-symbols-outlined text-[16px]"
                  style={{ color: newNoteHideFromAi ? '#0D9F6E' : '#5C6F65' }}
                >
                  visibility_off
                </span>
                <span className="text-xs font-ui-semibold" style={{ color: '#1A2620' }}>
                  Hide from AI
                </span>
                <span
                  className="relative inline-block rounded-full transition-colors"
                  style={{ width: 36, height: 20, background: newNoteHideFromAi ? '#0D9F6E' : '#D8E2DC' }}
                >
                  <span
                    className="absolute top-[2px] left-[2px] w-4 h-4 rounded-full bg-white transition-transform"
                    style={{
                      boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                      transform: newNoteHideFromAi ? 'translateX(16px)' : undefined,
                    }}
                  />
                </span>
              </button>
            </div>

            {/* Attached file */}
            {newNoteFile && (
              <div className="flex flex-wrap gap-2 px-lg pt-sm">
                <span
                  className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-md text-xs"
                  style={{ background: '#EEF2F0', color: '#1A2620' }}
                >
                  <span className="material-symbols-outlined text-[14px]" style={{ color: '#5C6F65' }}>
                    attach_file
                  </span>
                  <span className="max-w-[220px] truncate">{newNoteFile.name}</span>
                  <button
                    aria-label="Remove"
                    className="material-symbols-outlined text-[14px] rounded-full flex items-center justify-center"
                    style={{ color: '#5C6F65', width: 16, height: 16 }}
                    type="button"
                    onClick={() => setNewNoteFile(null)}
                  >
                    close
                  </button>
                </span>
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-lg py-md">
              <textarea
                className="w-full h-full resize-none focus:outline-none focus:ring-0 border-none text-sm bg-transparent"
                placeholder="Start writing..."
                style={{ color: '#1A2620', boxShadow: 'none' }}
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault()
                    submitNewNote()
                  }
                }}
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-lg py-md" style={{ borderTop: '1px solid #D8E2DC' }}>
              <button
                type="button"
                className="text-sm font-ui-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                style={{ background: '#ffffff', border: '1.5px solid #1A2620', color: '#1A2620' }}
                disabled={creatingNote}
                onClick={closeNewNote}
              >
                Cancel
              </button>
              <button
                type="button"
                className="text-white text-sm font-ui-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                style={{ background: '#0D9F6E' }}
                disabled={
                  creatingNote || transcribing || (!newNoteTitle.trim() && !newNoteText.trim() && !newNoteFile)
                }
                onClick={submitNewNote}
              >
                {creatingNote ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
