'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
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

type Insight = {
  id: string
  detectorType: string
  title: string
  summary: string
  evidence: { itemId: string; claimId: string; statement: string }[] | null
  createdAt: string
}

type UploadQueueStatus = 'pending' | 'uploading' | 'done' | 'failed'
type UploadQueueItem = {
  id: string
  file: File
  status: UploadQueueStatus
  error?: string
  // Failed client-side validation (bad extension / too large) — retrying won't help,
  // so "Retry failed" skips these.
  clientValidationFailed?: boolean
}

// Mirrors the allowlist enforced by app/api/v1/upload/route.ts so bad files never leave the
// browser. Audio's real cap there is 25MB (Groq Whisper's limit) — not the 100MB some specs
// float — validating against a looser number here would let files pass client-side only to
// be rejected by the server anyway, which is a worse experience than failing fast.
const UPLOAD_ALLOWED_EXTENSIONS = new Set(['.txt', '.md', '.pdf', '.mp3', '.wav', '.m4a'])
const UPLOAD_AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a'])
const UPLOAD_MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024
const UPLOAD_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024

function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex === -1 ? '' : fileName.slice(dotIndex).toLowerCase()
}

function validateUploadFile(file: File): string | null {
  const extension = getFileExtension(file.name)
  if (!UPLOAD_ALLOWED_EXTENSIONS.has(extension)) return 'Unsupported format'
  const isAudio = UPLOAD_AUDIO_EXTENSIONS.has(extension)
  const maxSize = isAudio ? UPLOAD_MAX_AUDIO_SIZE_BYTES : UPLOAD_MAX_FILE_SIZE_BYTES
  if (file.size > maxSize) return 'File too large'
  return null
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DashboardClient() {
  const workspace = useWorkspace()
  const showToast = useToast()

  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)

  const [insights, setInsights] = useState<Insight[]>([])
  const [insightsLoading, setInsightsLoading] = useState(true)
  const [insightsError, setInsightsError] = useState(false)

  const [text, setText] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)

  const [inboxOpen, setInboxOpen] = useState(false)
  const [inboxSearch, setInboxSearch] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  const [globalSearchFocused, setGlobalSearchFocused] = useState(false)

  const [audioState, setAudioState] = useState<'idle' | 'recording' | 'recorded' | 'sending'>('idle')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)

  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([])
  const [bulkUploading, setBulkUploading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recordingTimerRef = useRef<number | null>(null)
  const bulkFileInputRef = useRef<HTMLInputElement>(null)
  // Source of truth for the upload queue — mutated synchronously by the sequential runner
  // (which awaits network calls between steps) and mirrored into uploadQueue state for
  // rendering, so the loop never reads a stale snapshot.
  const uploadQueueRef = useRef<UploadQueueItem[]>([])
  const uploadProcessingRef = useRef(false)

  useEffect(() => {
    loadItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the workspace changes, not on every loadItems identity change
  }, [workspace.id])

  useEffect(() => {
    loadInsights()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the workspace changes, not on every loadInsights identity change
  }, [workspace.id])

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current)
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  async function loadItems() {
    setLoading(true)
    const res = await fetch(`/api/v1/items?workspaceId=${workspace.id}&limit=50`)
    if (res.ok) setItems(await res.json())
    setLoading(false)
  }

  async function loadInsights() {
    setInsightsLoading(true)
    try {
      const res = await fetch(`/api/v1/insights?workspaceId=${workspace.id}`)
      if (!res.ok) throw new Error('Failed to load insights')
      setInsights(await res.json())
      setInsightsError(false)
    } catch {
      setInsights([])
      setInsightsError(true)
    } finally {
      setInsightsLoading(false)
    }
  }

  async function postItem(body: Record<string, string>) {
    const res = await fetch('/api/v1/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to save')
  }

  function syncUploadQueue() {
    setUploadQueue([...uploadQueueRef.current])
  }

  function enqueueUploadFiles(files: File[]) {
    if (files.length === 0) return
    const newItems: UploadQueueItem[] = files.map((file) => {
      const error = validateUploadFile(file)
      return {
        id: crypto.randomUUID(),
        file,
        status: error ? 'failed' : 'pending',
        error: error ?? undefined,
        clientValidationFailed: Boolean(error),
      }
    })
    uploadQueueRef.current = [...uploadQueueRef.current, ...newItems]
    syncUploadQueue()
    void runUploadQueue()
  }

  // Sequential by design (see task constraints) — one file in flight at a time, re-reading
  // uploadQueueRef each iteration so files enqueued mid-run (more drops/retries) get picked
  // up without a second, overlapping loop starting.
  async function runUploadQueue() {
    if (uploadProcessingRef.current) return
    uploadProcessingRef.current = true
    setBulkUploading(true)

    for (;;) {
      const next = uploadQueueRef.current.find((item) => item.status === 'pending')
      if (!next) break

      uploadQueueRef.current = uploadQueueRef.current.map((item) =>
        item.id === next.id ? { ...item, status: 'uploading' } : item
      )
      syncUploadQueue()

      try {
        const form = new FormData()
        form.append('file', next.file)
        form.append('workspaceId', workspace.id)
        const uploadRes = await fetch('/api/v1/upload', { method: 'POST', body: form })
        if (!uploadRes.ok) throw new Error((await uploadRes.json().catch(() => ({}))).error ?? 'Upload failed')
        const { path } = await uploadRes.json()
        await postItem({ workspaceId: workspace.id, type: 'file', sourceUrl: path })
        uploadQueueRef.current = uploadQueueRef.current.map((item) =>
          item.id === next.id ? { ...item, status: 'done' } : item
        )
      } catch (err) {
        uploadQueueRef.current = uploadQueueRef.current.map((item) =>
          item.id === next.id ? { ...item, status: 'failed', error: err instanceof Error ? err.message : 'Upload failed' } : item
        )
      }
      syncUploadQueue()
    }

    uploadProcessingRef.current = false
    setBulkUploading(false)

    const doneCount = uploadQueueRef.current.filter((item) => item.status === 'done').length
    const failedCount = uploadQueueRef.current.filter((item) => item.status === 'failed').length
    if (doneCount > 0) await loadItems()
    if (doneCount > 0 && failedCount === 0) {
      showToast(`${doneCount} file${doneCount === 1 ? '' : 's'} uploaded`, 'success')
      uploadQueueRef.current = []
      syncUploadQueue()
    }
  }

  function retryFailedUploads() {
    const hasRetryable = uploadQueueRef.current.some((item) => item.status === 'failed' && !item.clientValidationFailed)
    if (!hasRetryable) return
    uploadQueueRef.current = uploadQueueRef.current.map((item) =>
      item.status === 'failed' && !item.clientValidationFailed ? { ...item, status: 'pending', error: undefined } : item
    )
    syncUploadQueue()
    void runUploadQueue()
  }

  function clearUploadQueue() {
    uploadQueueRef.current = []
    syncUploadQueue()
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

  function formatDuration(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
    const seconds = (totalSeconds % 60).toString().padStart(2, '0')
    return `${minutes}:${seconds}`
  }

  async function startRecording() {
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
      setRecordedBlob(blob)
      setRecordedUrl(URL.createObjectURL(blob))
      setAudioState('recorded')
      stream.getTracks().forEach((track) => track.stop())
      recordingStreamRef.current = null
    }

    mediaRecorderRef.current = recorder
    recorder.start()
    setAudioState('recording')
    setRecordingSeconds(0)
    recordingTimerRef.current = window.setInterval(() => {
      setRecordingSeconds((s) => s + 1)
    }, 1000)
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
  }

  function discardRecording() {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl)
    setRecordedBlob(null)
    setRecordedUrl(null)
    setRecordingSeconds(0)
    setAudioState('idle')
  }

  function reRecordAudio() {
    discardRecording()
    startRecording()
  }

  async function sendRecording() {
    if (!recordedBlob) return
    setAudioState('sending')
    try {
      const form = new FormData()
      form.append('audio', recordedBlob, 'recording.webm')
      form.append('workspaceId', workspace.id)
      const res = await fetch('/api/v1/audio', { method: 'POST', body: form })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to upload recording')

      if (recordedUrl) URL.revokeObjectURL(recordedUrl)
      setRecordedBlob(null)
      setRecordedUrl(null)
      setRecordingSeconds(0)
      setAudioState('idle')
      await loadItems()
      showToast('Транскрибируется…', 'success')
    } catch (err) {
      setAudioState('recorded')
      showToast(err instanceof Error ? err.message : 'Не удалось отправить запись', 'error')
    }
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
  const previewInsights = insights.slice(0, 3)

  const uploadTotal = uploadQueue.length
  const uploadDoneCount = uploadQueue.filter((item) => item.status === 'done').length
  const uploadFailedCount = uploadQueue.filter((item) => item.status === 'failed').length
  const uploadProcessedCount = uploadDoneCount + uploadFailedCount
  const uploadCurrentIndex = Math.min(uploadProcessedCount + 1, uploadTotal)
  const uploadHasRetryableFailures = uploadQueue.some((item) => item.status === 'failed' && !item.clientValidationFailed)

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

          {audioState === 'recording' && (
            <div className="flex items-center gap-2 pl-lg pt-sm">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
              <span className="font-metadata-mono text-xs text-on-surface">{formatDuration(recordingSeconds)}</span>
              <span className="text-xs text-on-surface-variant">Запись идёт…</span>
            </div>
          )}

          {(audioState === 'recorded' || audioState === 'sending') && recordedUrl && (
            <div className="flex flex-col gap-2 pl-lg pt-sm">
              <audio controls src={recordedUrl} className="w-full h-9" />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="bg-[#0D9F6E] hover:bg-primary text-white font-ui-semibold text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  disabled={audioState === 'sending'}
                  onClick={sendRecording}
                >
                  {audioState === 'sending' ? 'Транскрибируется…' : 'Отправить'}
                </button>
                <button
                  type="button"
                  className="text-on-surface-variant hover:text-on-surface font-ui-semibold text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  disabled={audioState === 'sending'}
                  onClick={reRecordAudio}
                >
                  Перезаписать
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pl-lg pt-sm">
            <div className="flex items-center gap-1">
              <input
                ref={fileInputRef}
                className="hidden"
                multiple
                type="file"
                accept=".pdf,.txt,.md,.mp3,.wav,.m4a"
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
              {audioState === 'idle' && (
                <button
                  aria-label="Записать"
                  className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[#EEF2F0]"
                  style={{ color: '#3d4a42' }}
                  type="button"
                  onClick={startRecording}
                >
                  <span className="material-symbols-outlined text-[18px]">mic</span>
                </button>
              )}
              {audioState === 'recording' && (
                <button
                  aria-label="Стоп"
                  className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-red-50"
                  style={{ color: '#dc2626' }}
                  type="button"
                  onClick={stopRecording}
                >
                  <span className="material-symbols-outlined text-[18px]">stop_circle</span>
                </button>
              )}
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

      {/* Bulk upload */}
      <section className="w-full">
        <span className="font-label-caps text-label-caps text-outline mb-sm block">BULK UPLOAD</span>
        <div
          className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 py-lg px-md cursor-pointer transition-colors"
          style={{
            borderColor: isDragOver ? '#0D9F6E' : '#D8E2DC',
            background: isDragOver ? 'rgba(13,159,110,0.06)' : '#FFFFFF',
          }}
          onClick={() => bulkFileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragOver(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            setIsDragOver(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragOver(false)
            enqueueUploadFiles(Array.from(e.dataTransfer.files))
          }}
        >
          <input
            ref={bulkFileInputRef}
            className="hidden"
            multiple
            type="file"
            accept=".txt,.md,.pdf,.mp3,.wav,.m4a"
            onChange={(e) => {
              enqueueUploadFiles(Array.from(e.target.files ?? []))
              e.target.value = ''
            }}
          />
          <span
            className="material-symbols-outlined text-[22px]"
            style={{ color: isDragOver ? '#0D9F6E' : '#5C6F65' }}
          >
            upload_file
          </span>
          <p className="text-sm font-ui-semibold" style={{ color: '#1A2620' }}>
            Drop files here or click to browse
          </p>
          <p className="text-xs" style={{ color: '#5C6F65' }}>
            .txt, .md, .pdf, .mp3, .wav, .m4a
          </p>
        </div>

        {uploadQueue.length > 0 && (
          <div className="mt-sm rounded-xl border overflow-hidden" style={{ borderColor: '#D8E2DC', background: '#FFFFFF' }}>
            <div className="flex items-center justify-between gap-sm px-md py-sm border-b" style={{ borderColor: '#D8E2DC' }}>
              <span className="text-sm font-ui-semibold" style={{ color: '#1A2620' }}>
                {bulkUploading
                  ? `Uploading ${uploadCurrentIndex} of ${uploadTotal}...`
                  : uploadFailedCount > 0
                    ? `${uploadDoneCount} of ${uploadTotal} uploaded. ${uploadFailedCount} failed.`
                    : `${uploadDoneCount} of ${uploadTotal} uploaded`}
              </span>
              {!bulkUploading && (
                <div className="flex items-center gap-sm shrink-0">
                  {uploadHasRetryableFailures && (
                    <button
                      type="button"
                      className="text-xs font-ui-semibold"
                      style={{ color: '#0D9F6E' }}
                      onClick={retryFailedUploads}
                    >
                      Retry failed
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-xs font-ui-semibold"
                    style={{ color: '#5C6F65' }}
                    onClick={clearUploadQueue}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto">
              {uploadQueue.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-sm px-md py-2 border-b last:border-b-0"
                  style={{ borderColor: '#D8E2DC' }}
                >
                  <div className="flex items-center gap-sm min-w-0">
                    <span className="material-symbols-outlined text-[16px] shrink-0" style={{ color: '#5C6F65' }}>
                      {UPLOAD_AUDIO_EXTENSIONS.has(getFileExtension(item.file.name)) ? 'mic' : 'description'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-ui-semibold truncate" style={{ color: '#1A2620' }}>
                        {item.file.name}
                      </p>
                      <p className="text-[11px]" style={{ color: '#5C6F65' }}>
                        {formatFileSize(item.file.size)}
                        {item.error ? ` · ${item.error}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 flex items-center">
                    {item.status === 'pending' && (
                      <span className="material-symbols-outlined text-[16px]" style={{ color: '#5C6F65' }}>
                        schedule
                      </span>
                    )}
                    {item.status === 'uploading' && (
                      <span
                        className="w-3.5 h-3.5 rounded-full border-2 animate-spin block"
                        style={{ borderColor: '#D8E2DC', borderTopColor: '#0D9F6E' }}
                      />
                    )}
                    {item.status === 'done' && (
                      <span className="material-symbols-outlined text-[16px]" style={{ color: '#0D9F6E' }}>
                        check_circle
                      </span>
                    )}
                    {item.status === 'failed' && (
                      <span className="material-symbols-outlined text-[16px]" style={{ color: '#ba1a1a' }}>
                        cancel
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Insights preview — the primary value, shown above Inbox */}
      {!insightsError && (
        <section>
          <div className="flex justify-between items-center mb-md px-xs">
            <div className="flex items-center gap-2">
              <span className="font-label-caps text-label-caps text-outline">PATTERNS FOUND</span>
              {!insightsLoading && insights.length > 0 && (
                <span className="bg-surface-container-highest text-on-surface-variant px-2 py-[2px] rounded-full text-xs font-bold">
                  {insights.length}
                </span>
              )}
            </div>
            {!insightsLoading && insights.length > 0 && (
              <Link
                href="/insights"
                className="font-ui-semibold text-sm text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-1"
              >
                View all insights <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </Link>
            )}
          </div>

          {insightsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-xl p-md" style={{ background: '#EEF2F0', minHeight: 132 }}>
                  <div className="h-3 w-20 rounded-full animate-pulse" style={{ background: '#D8E2DC' }} />
                  <div className="h-4 w-full rounded-lg animate-pulse mt-md" style={{ background: '#D8E2DC' }} />
                  <div className="h-4 w-3/4 rounded-lg animate-pulse mt-2" style={{ background: '#D8E2DC' }} />
                  <div className="h-3 w-24 rounded-full animate-pulse mt-lg" style={{ background: '#D8E2DC' }} />
                </div>
              ))}
            </div>
          ) : previewInsights.length === 0 ? (
            <p className="text-sm text-outline px-xs">Add more notes and Flare will start finding patterns.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
              {previewInsights.map((insight) => {
                const noteCount = new Set((insight.evidence ?? []).map((ref) => ref.itemId)).size
                return (
                  <Link
                    key={insight.id}
                    href="/insights"
                    className="insight-card-accent rounded-xl p-md flex flex-col hover:shadow-lg transition-all duration-300"
                  >
                    <h3 className="font-ui-semibold text-on-surface text-sm">{insight.title}</h3>
                    <p
                      className="font-body-md text-sm text-on-surface-variant mt-sm flex-1"
                      style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    >
                      {insight.summary}
                    </p>
                    {noteCount > 0 && (
                      <p className="mt-md font-metadata-mono text-[11px] text-on-surface-variant">
                        Based on {noteCount} note{noteCount === 1 ? '' : 's'}
                      </p>
                    )}
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Inbox */}
      {loading ? (
        <div className="rounded-xl p-md max-w-sm w-full" style={{ background: '#EEF2F0', minHeight: 220 }}>
          <div className="h-3 w-16 rounded-full animate-pulse" style={{ background: '#D8E2DC' }} />
          <div className="h-9 w-20 rounded-lg animate-pulse mt-md" style={{ background: '#D8E2DC' }} />
          <div className="h-10 w-full rounded-lg animate-pulse mt-lg" style={{ background: '#D8E2DC' }} />
          <div className="h-10 w-full rounded-lg animate-pulse mt-2" style={{ background: '#D8E2DC' }} />
          <div className="h-10 w-full rounded-lg animate-pulse mt-2" style={{ background: '#D8E2DC' }} />
        </div>
      ) : (
        <div className="max-w-sm w-full">
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
