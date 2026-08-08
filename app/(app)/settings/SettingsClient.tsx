'use client'

import { useState } from 'react'
import { useWorkspace } from '@/components/shell/WorkspaceContext'
import { SidebarToggleButton } from '@/components/shell/SidebarToggleButton'
import { useToast } from '@/components/shell/ToastProvider'

type SectionKey =
  | 'general'
  | 'folders'
  | 'insights'
  | 'integrations'
  | 'notifications'
  | 'export'
  | 'members'
  | 'danger'

type Folder = { name: string; description: string }

const SECTIONS: { id: SectionKey; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'tune' },
  { id: 'folders', label: 'Folders', icon: 'folder' },
  { id: 'insights', label: 'Insights', icon: 'insights' },
  { id: 'integrations', label: 'Integrations', icon: 'extension' },
  { id: 'notifications', label: 'Notifications', icon: 'notifications' },
  { id: 'export', label: 'Export', icon: 'download' },
  { id: 'members', label: 'Members', icon: 'group' },
  { id: 'danger', label: 'Danger Zone', icon: 'warning' },
]

// No folders API exists yet, so there's no real data to seed this with —
// starts empty rather than showing made-up folder names.
const DEFAULT_FOLDERS: Folder[] = []

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function SectionShell({ title, desc, children }: { title: string; desc?: string | null; children: React.ReactNode }) {
  return (
    <div className="mx-auto px-lg pt-lg pb-32" style={{ maxWidth: 'var(--content-width, 640px)' }}>
      <h2 className="font-display-sm mb-1" style={{ fontSize: 22, fontWeight: 800, color: '#1A2620' }}>
        {title}
      </h2>
      {desc ? (
        <p className="text-sm mb-lg" style={{ color: '#5C6F65' }}>
          {desc}
        </p>
      ) : (
        <div className="mb-lg" />
      )}
      {children}
    </div>
  )
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      aria-pressed={on}
      className="shrink-0 relative inline-block rounded-full transition-colors"
      style={{ width: 36, height: 20, background: on ? '#0D9F6E' : '#D8E2DC' }}
      type="button"
      onClick={onToggle}
    >
      <span
        className="absolute top-[2px] left-[2px] w-4 h-4 rounded-full bg-white transition-transform"
        style={{ transform: on ? 'translateX(16px)' : 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.25)' }}
      />
    </button>
  )
}

function ToggleRow({ label, desc, on, onToggle }: { label: string; desc?: string | null; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between py-sm">
      <div>
        <p className="text-sm font-ui-semibold" style={{ color: '#1A2620' }}>
          {label}
        </p>
        {desc && (
          <p className="text-xs" style={{ color: '#5C6F65' }}>
            {desc}
          </p>
        )}
      </div>
      <Toggle on={on} onToggle={onToggle} />
    </div>
  )
}

function GeneralSection({ workspaceName, onLabelChange }: { workspaceName: string; onLabelChange: (name: string) => void }) {
  const [name, setName] = useState(workspaceName)
  const [language, setLanguage] = useState('auto')
  const [saved, setSaved] = useState(false)

  return (
    <SectionShell title="General">
      <div className="mb-xl">
        <label className="block text-xs font-ui-semibold mb-1" style={{ color: '#5C6F65' }}>
          Workspace name
        </label>
        <div className="flex items-center gap-2">
          <input
            className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 transition-all"
            style={{ background: '#EEF2F0', border: '1px solid #D8E2DC', color: '#1A2620' }}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="text-white text-sm font-ui-semibold px-4 py-2 rounded-lg transition-colors active:scale-95 shrink-0 hover:bg-[#0b8a5f]"
            style={{ background: '#0D9F6E' }}
            type="button"
            onClick={() => {
              const next = name.trim() || workspaceName
              setName(next)
              onLabelChange(next)
              setSaved(true)
              setTimeout(() => setSaved(false), 1200)
            }}
          >
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
      <div>
        <label className="block text-xs font-ui-semibold mb-1" style={{ color: '#5C6F65' }}>
          Insights language
        </label>
        <select
          className="px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 transition-all"
          style={{ background: '#EEF2F0', border: '1px solid #D8E2DC', color: '#1A2620' }}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="auto">Auto (detect from notes)</option>
          <option value="en">English</option>
          <option value="ru">Russian</option>
        </select>
      </div>
    </SectionShell>
  )
}

function FoldersSection({
  folders,
  onEdit,
  onDelete,
  onAdd,
}: {
  folders: Folder[]
  onEdit: (index: number) => void
  onDelete: (index: number) => void
  onAdd: () => void
}) {
  const [confirmingIndex, setConfirmingIndex] = useState<number | null>(null)

  return (
    <SectionShell
      title="Folders"
      desc="Manage the folders your notes get organized into. Click a folder to rename it or write AI instructions for it."
    >
      <div className="rounded-xl p-sm" style={{ background: '#FFFFFF', border: '1px solid #D8E2DC' }}>
        {folders.length === 0 && (
          <p className="text-sm p-sm" style={{ color: '#5C6F65' }}>
            No folders yet — add one to start organizing your Vault.
          </p>
        )}
        {folders.map((folder, i) =>
          confirmingIndex === i ? (
            <div className="flex items-center justify-between gap-sm w-full p-sm" key={`${folder.name}-${i}`}>
              <span className="text-sm" style={{ color: '#1A2620' }}>
                Delete <strong>{folder.name}</strong>? This can&apos;t be undone.
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  className="text-sm font-ui-semibold px-3 py-1.5 rounded-lg transition-colors"
                  style={{ background: '#FFFFFF', border: '1.5px solid #D8E2DC', color: '#1A2620' }}
                  type="button"
                  onClick={() => setConfirmingIndex(null)}
                >
                  Cancel
                </button>
                <button
                  className="text-sm font-ui-semibold px-3 py-1.5 rounded-lg transition-colors text-white"
                  style={{ background: '#ba1a1a' }}
                  type="button"
                  onClick={() => {
                    onDelete(i)
                    setConfirmingIndex(null)
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <div
              className="flex items-start justify-between gap-sm p-sm rounded-lg cursor-pointer transition-colors hover:bg-[#F7F9F8]"
              key={`${folder.name}-${i}`}
              onClick={() => onEdit(i)}
            >
              <div className="flex items-start gap-sm min-w-0 flex-1">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#EEF2F0' }}>
                  <span className="material-symbols-outlined text-[18px]" style={{ color: '#5C6F65' }}>
                    folder
                  </span>
                </div>
                <div className="min-w-0 break-words">
                  <div className="text-sm font-ui-semibold" style={{ color: '#1A2620', overflowWrap: 'break-word' }}>
                    {folder.name}
                  </div>
                  <div className="text-xs" style={{ color: '#5C6F65', overflowWrap: 'break-word' }}>
                    {folder.description || 'No AI description yet'}
                  </div>
                </div>
              </div>
              <button
                aria-label="Delete folder"
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg transition-colors hover:text-[#ba1a1a]"
                style={{ color: '#5C6F65' }}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirmingIndex(i)
                }}
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          )
        )}
      </div>
      <button
        className="mt-sm flex items-center gap-1 text-sm font-ui-semibold px-3 py-2 rounded-lg transition-colors hover:bg-[#EEF2F0]"
        style={{ color: '#0D9F6E' }}
        type="button"
        onClick={onAdd}
      >
        <span className="material-symbols-outlined text-[18px]">add</span> Add folder
      </button>
    </SectionShell>
  )
}

function InsightsSection() {
  const [instructions, setInstructions] = useState('')
  const [schedule, setSchedule] = useState<'daily' | 'weekly' | 'threshold'>('daily')
  const [scheduleDay, setScheduleDay] = useState('Monday')
  const [saved, setSaved] = useState(false)

  const scheduleOptions: { id: typeof schedule; label: string }[] = [
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'threshold', label: 'When 10+ new notes added' },
  ]

  return (
    <SectionShell title="Insights" desc="Tell the AI what to focus on when generating insights for this workspace.">
      <textarea
        className="w-full rounded-lg text-sm p-3 focus:outline-none focus:ring-2 transition-all mb-sm"
        placeholder="e.g. Focus more on customer feedback. Highlight recurring blockers. Prioritize insights about growth and retention."
        rows={6}
        style={{ background: '#EEF2F0', border: '1px solid #D8E2DC', color: '#1A2620', resize: 'none' }}
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
      />
      <button
        className="text-white text-sm font-ui-semibold px-4 py-2 rounded-lg transition-colors active:scale-95 hover:bg-[#0b8a5f]"
        style={{ background: '#0D9F6E' }}
        type="button"
        onClick={() => {
          setSaved(true)
          setTimeout(() => setSaved(false), 1200)
        }}
      >
        {saved ? 'Saved' : 'Save'}
      </button>
      <div className="border-t my-xl" style={{ borderColor: '#D8E2DC' }} />
      <p className="font-label-caps text-label-caps mb-sm" style={{ color: '#5C6F65' }}>
        GENERATION SCHEDULE
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        {scheduleOptions.map((o) => {
          const isActive = o.id === schedule
          return (
            <button
              key={o.id}
              className="px-4 py-1.5 rounded-full font-ui-semibold text-sm whitespace-nowrap transition-colors"
              style={{
                background: isActive ? '#0D9F6E' : '#FFFFFF',
                color: isActive ? '#FFFFFF' : '#5C6F65',
                border: `1px solid ${isActive ? '#0D9F6E' : '#D8E2DC'}`,
              }}
              type="button"
              onClick={() => setSchedule(o.id)}
            >
              {o.label}
            </button>
          )
        })}
      </div>
      {schedule === 'weekly' && (
        <div className="mt-sm">
          <select
            className="px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 transition-all"
            style={{ background: '#EEF2F0', border: '1px solid #D8E2DC', color: '#1A2620' }}
            value={scheduleDay}
            onChange={(e) => setScheduleDay(e.target.value)}
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      )}
    </SectionShell>
  )
}

function IntegrationCard({
  title,
  desc,
  iconBg,
  iconLabel,
  connected,
  connectedAsLabel,
  onToggle,
}: {
  title: string
  desc: string
  iconBg: string
  iconLabel: string
  connected: boolean
  connectedAsLabel: string
  onToggle: () => void
}) {
  return (
    <div className="rounded-xl p-md flex items-center justify-between gap-md" style={{ background: '#FFFFFF', border: '1px solid #D8E2DC' }}>
      <div className="flex items-center gap-sm min-w-0">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-white font-ui-semibold"
          style={{ background: iconBg }}
        >
          {iconLabel}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-ui-semibold" style={{ color: '#1A2620' }}>
            {title}
          </p>
          <p className="text-xs" style={{ color: '#5C6F65' }}>
            {desc}
          </p>
          <div className="mt-1">
            {connected ? (
              <span className="flex items-center gap-1 text-xs" style={{ color: '#0D9F6E' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#0D9F6E' }} />
                Connected as {connectedAsLabel}
              </span>
            ) : (
              <span className="text-xs" style={{ color: '#5C6F65' }}>
                Not connected
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="shrink-0">
        {connected ? (
          <button
            className="text-sm font-ui-semibold px-4 py-2 rounded-lg transition-colors"
            style={{ background: '#FFFFFF', border: '1.5px solid #D8E2DC', color: '#1A2620' }}
            type="button"
            onClick={onToggle}
          >
            Disconnect
          </button>
        ) : (
          <button
            className="text-white text-sm font-ui-semibold px-4 py-2 rounded-lg transition-colors hover:bg-[#0b8a5f]"
            style={{ background: '#0D9F6E' }}
            type="button"
            onClick={onToggle}
          >
            Connect
          </button>
        )}
      </div>
    </div>
  )
}

function IntegrationsSection({ workspaceName }: { workspaceName: string }) {
  const [notionConnected, setNotionConnected] = useState(false)
  const [gdriveConnected, setGdriveConnected] = useState(false)
  const [mdStatus, setMdStatus] = useState('Import from local folder or .zip')

  return (
    <SectionShell title="Integrations" desc="Bring notes in from where you already write.">
      <div className="flex flex-col gap-sm">
        <IntegrationCard
          title="Notion"
          desc="Import pages and databases"
          iconBg="#000000"
          iconLabel="N"
          connected={notionConnected}
          connectedAsLabel={workspaceName}
          onToggle={() => setNotionConnected((v) => !v)}
        />
        <IntegrationCard
          title="Google Drive"
          desc="Import Docs and files"
          iconBg="#0D9F6E"
          iconLabel="G"
          connected={gdriveConnected}
          connectedAsLabel={workspaceName}
          onToggle={() => setGdriveConnected((v) => !v)}
        />
        <div className="rounded-xl p-md flex items-center justify-between gap-md" style={{ background: '#FFFFFF', border: '1px solid #D8E2DC' }}>
          <div className="flex items-center gap-sm min-w-0">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#EEF2F0' }}>
              <span className="material-symbols-outlined text-[20px]" style={{ color: '#5C6F65' }}>
                folder_zip
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-ui-semibold" style={{ color: '#1A2620' }}>
                Markdown folder
              </p>
              <p className="text-xs" style={{ color: '#5C6F65' }}>
                {mdStatus}
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <input
              className="hidden"
              id="settings-md-file-input"
              multiple
              type="file"
              onChange={(e) => {
                const count = e.target.files?.length ?? 0
                setMdStatus(count > 0 ? `${count} file${count === 1 ? '' : 's'} selected (demo, not uploaded)` : 'Import from local folder or .zip')
              }}
            />
            <button
              className="text-sm font-ui-semibold px-4 py-2 rounded-lg transition-colors"
              style={{ background: '#FFFFFF', border: '1.5px solid #D8E2DC', color: '#1A2620' }}
              type="button"
              onClick={() => document.getElementById('settings-md-file-input')?.click()}
            >
              Import files
            </button>
          </div>
        </div>
      </div>
    </SectionShell>
  )
}

function NotificationsSection() {
  const [digestOn, setDigestOn] = useState(true)
  const [digestDay, setDigestDay] = useState('Monday')
  const [digestTime, setDigestTime] = useState('09:00')
  const [notifyNewInsight, setNotifyNewInsight] = useState(true)
  const [notifyProcessing, setNotifyProcessing] = useState(false)
  const times = ['08:00', '09:00', '10:00', '12:00']

  return (
    <SectionShell title="Notifications">
      <div className="divide-y" style={{ borderColor: '#D8E2DC' }}>
        <ToggleRow
          label="Weekly email digest"
          desc="A summary of new insights, sent once a week."
          on={digestOn}
          onToggle={() => setDigestOn((v) => !v)}
        />
        {digestOn && (
          <div className="pb-sm">
            <div className="flex items-center gap-2 pl-0">
              <select
                className="px-3 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-2 transition-all"
                style={{ background: '#EEF2F0', border: '1px solid #D8E2DC', color: '#1A2620' }}
                value={digestDay}
                onChange={(e) => setDigestDay(e.target.value)}
              >
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                className="px-3 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-2 transition-all"
                style={{ background: '#EEF2F0', border: '1px solid #D8E2DC', color: '#1A2620' }}
                value={digestTime}
                onChange={(e) => setDigestTime(e.target.value)}
              >
                {times.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <ToggleRow label="Notify when new insight is ready" on={notifyNewInsight} onToggle={() => setNotifyNewInsight((v) => !v)} />
        <ToggleRow label="Notify when notes finish processing" on={notifyProcessing} onToggle={() => setNotifyProcessing((v) => !v)} />
      </div>
    </SectionShell>
  )
}

function ExportSection() {
  const [exporting, setExporting] = useState(false)

  return (
    <SectionShell title="Export" desc="Download all your notes and insights as Markdown files.">
      <button
        className="text-sm font-ui-semibold px-5 py-3 rounded-lg transition-colors active:scale-95 hover:bg-[#D1FAE5]"
        style={{ background: '#FFFFFF', border: '1.5px solid #0D9F6E', color: '#0D9F6E' }}
        type="button"
        disabled={exporting}
        onClick={() => {
          setExporting(true)
          setTimeout(() => setExporting(false), 1400)
        }}
      >
        <span className="material-symbols-outlined text-[18px] align-middle mr-1">
          {exporting ? 'hourglass_top' : 'download'}
        </span>
        {exporting ? 'Preparing export…' : 'Export as Markdown .zip'}
      </button>
      <p className="text-xs mt-sm" style={{ color: '#5C6F65' }}>
        Includes all notes, sources, and generated insights. Does not include AI embeddings.
      </p>
    </SectionShell>
  )
}

function MembersSection() {
  const [notified, setNotified] = useState(false)

  return (
    <div className="mx-auto px-lg pt-lg pb-32" style={{ maxWidth: 'var(--content-width, 640px)' }}>
      <div className="flex flex-col items-center justify-center text-center py-32">
        <span className="material-symbols-outlined text-[40px] mb-md" style={{ color: '#0D9F6E' }}>
          group
        </span>
        <h2 className="font-display-sm mb-1" style={{ fontSize: 20, fontWeight: 800, color: '#1A2620' }}>
          Team workspaces are coming
        </h2>
        <p className="text-sm mb-lg" style={{ color: '#5C6F65', maxWidth: 320 }}>
          Invite teammates to collaborate on shared notes and insights.
        </p>
        <button
          className="text-sm font-ui-semibold px-5 py-2.5 rounded-lg transition-colors active:scale-95"
          style={{ background: notified ? '#D1FAE5' : '#0D9F6E', color: notified ? '#0D9F6E' : '#FFFFFF' }}
          type="button"
          disabled={notified}
          onClick={() => setNotified(true)}
        >
          {notified ? "You're on the list ✓" : "Notify me when it's ready"}
        </button>
      </div>
    </div>
  )
}

function DangerSection() {
  const showToast = useToast()

  function confirmAndRun(message: string, onConfirm: () => void) {
    const confirmation = window.prompt(message)
    if (confirmation === 'DELETE') onConfirm()
  }

  return (
    <SectionShell title="Danger Zone">
      <div className="rounded-xl p-md" style={{ border: '1px solid #FCA5A5' }}>
        <div className="flex items-center justify-between gap-md py-sm">
          <div className="min-w-0">
            <p className="text-sm font-ui-semibold" style={{ color: '#1A2620' }}>
              Delete all data
            </p>
            <p className="text-xs" style={{ color: '#5C6F65' }}>
              Permanently delete all notes, sources, and insights in this workspace. The workspace itself will remain.
            </p>
          </div>
          <button
            className="shrink-0 text-sm font-ui-semibold px-4 py-2 rounded-lg transition-colors"
            style={{ background: '#FFFFFF', border: '1.5px solid #ba1a1a', color: '#ba1a1a' }}
            type="button"
            onClick={() =>
              confirmAndRun('Type DELETE to confirm you want to permanently delete all data in this workspace.', () =>
                showToast('Deleting all data is not available yet.', 'error')
              )
            }
          >
            Delete all data
          </button>
        </div>
        <div className="border-t my-sm" style={{ borderColor: '#FCA5A5' }} />
        <div className="flex items-center justify-between gap-md py-sm">
          <div className="min-w-0">
            <p className="text-sm font-ui-semibold" style={{ color: '#1A2620' }}>
              Delete workspace
            </p>
            <p className="text-xs" style={{ color: '#5C6F65' }}>
              Permanently delete this workspace and everything in it. This cannot be undone.
            </p>
          </div>
          <button
            className="shrink-0 text-sm font-ui-semibold px-4 py-2 rounded-lg transition-colors text-white"
            style={{ background: '#ba1a1a' }}
            type="button"
            onClick={() =>
              confirmAndRun('Type DELETE to confirm you want to permanently delete this workspace.', () =>
                showToast('Deleting a workspace is not available yet.', 'error')
              )
            }
          >
            Delete workspace
          </button>
        </div>
      </div>
    </SectionShell>
  )
}

function FolderEditorOverlay({
  open,
  folder,
  onClose,
  onSave,
}: {
  open: boolean
  folder: Folder | null
  onClose: () => void
  onSave: (folder: Folder) => void
}) {
  const [name, setName] = useState(folder?.name ?? '')
  const [description, setDescription] = useState(folder?.description ?? '')

  function handleClose() {
    setName('')
    setDescription('')
    onClose()
  }

  function handleSave() {
    const trimmedName = name.trim()
    if (!trimmedName) return
    onSave({ name: trimmedName, description: description.trim() })
    setName('')
    setDescription('')
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70]">
      <div
        className="absolute inset-0 transition-opacity duration-300 ease-out opacity-100"
        style={{ background: 'rgba(26,38,32,0.5)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
        onClick={handleClose}
      />
      <div
        className="absolute right-0 top-0 h-full w-full sm:w-[640px] bg-white flex flex-col transition-transform duration-300 ease-out"
        style={{ boxShadow: '-8px 0 32px rgba(26,38,32,0.14)', transform: 'translateX(0)' }}
      >
        <div className="flex items-center justify-between gap-md px-lg py-md" style={{ borderBottom: '1px solid #D8E2DC' }}>
          <div className="flex items-center gap-sm min-w-0 flex-1">
            <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-on-surface-variant">folder</span>
            </div>
            <input
              className="flex-1 min-w-0 bg-transparent border-none focus:outline-none focus:ring-0 p-0 font-ui-semibold"
              placeholder="Folder name"
              style={{ color: '#1A2620', fontSize: 16 }}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus={!folder?.name}
            />
          </div>
          <button
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors active:scale-95 shrink-0 hover:bg-[#EEF2F0]"
            style={{ color: '#5C6F65' }}
            type="button"
            onClick={handleClose}
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-lg py-md">
          <label className="block text-xs font-ui-semibold mb-1" style={{ color: '#5C6F65' }}>
            AI description
          </label>
          <p className="text-xs mb-sm" style={{ color: '#5C6F65' }}>
            Tell the AI what belongs in this folder and how to treat notes filed here.
          </p>
          <textarea
            className="w-full rounded-lg text-sm p-3 focus:outline-none focus:ring-2 transition-all"
            placeholder="e.g. Early-stage product ideas, not yet validated. Route anything speculative or half-formed here."
            rows={8}
            style={{ background: '#EEF2F0', border: '1px solid #D8E2DC', color: '#1A2620', resize: 'none' }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-lg py-md" style={{ borderTop: '1px solid #D8E2DC' }}>
          <button
            className="text-sm font-ui-semibold px-4 py-2 rounded-lg transition-colors hover:bg-[#1A2620] hover:text-white"
            style={{ background: '#ffffff', border: '1.5px solid #1A2620', color: '#1A2620' }}
            type="button"
            onClick={handleClose}
          >
            Cancel
          </button>
          <button
            className="text-white text-sm font-ui-semibold px-4 py-2 rounded-lg transition-colors active:scale-95 hover:bg-[#0b8a5f]"
            style={{ background: '#0D9F6E' }}
            type="button"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export function SettingsClient() {
  const workspace = useWorkspace()
  const [workspaceLabel, setWorkspaceLabel] = useState(workspace.name)
  const [activeSection, setActiveSection] = useState<SectionKey>('general')
  const [mobileShowContent, setMobileShowContent] = useState(false)
  const [folders, setFolders] = useState<Folder[]>(DEFAULT_FOLDERS)
  const [editingIndex, setEditingIndex] = useState<number | null | undefined>(undefined)

  const editingFolder = editingIndex === null ? { name: '', description: '' } : editingIndex !== undefined ? folders[editingIndex] : null

  return (
    <div className="flex-1 h-screen overflow-hidden relative flex flex-col">
      <div className="flex items-center gap-1 px-lg pt-lg pb-md shrink-0">
        <SidebarToggleButton />
      </div>

      <div className="flex-1 flex min-h-0 border-t" style={{ borderColor: '#D8E2DC' }}>
        <div
          className={`w-full md:w-[220px] shrink-0 md:border-r flex-col min-h-0 overflow-y-auto ${
            mobileShowContent ? 'hidden md:flex' : 'flex'
          }`}
          style={{ borderColor: '#D8E2DC' }}
        >
          <div className="px-md pt-lg pb-md">
            <h1 className="font-display-sm" style={{ fontSize: 24, fontWeight: 800, color: '#1A2620' }}>
              Settings
            </h1>
            <p className="text-sm mt-1" style={{ color: '#5C6F65' }}>
              {workspaceLabel}
            </p>
          </div>
          <ul className="flex flex-col gap-xs px-sm pb-md font-ui-semibold text-ui-semibold">
            {SECTIONS.map((s) => {
              const isActive = s.id === activeSection
              return (
                <li key={s.id}>
                  <a
                    href="#"
                    className="flex items-center gap-sm px-sm py-sm rounded-lg transition-colors active:scale-95 duration-150"
                    style={{
                      color: isActive ? '#0D9F6E' : '#3d4a42',
                      fontWeight: isActive ? 700 : 600,
                      background: isActive ? '#D1FAE5' : 'transparent',
                    }}
                    onClick={(e) => {
                      e.preventDefault()
                      setActiveSection(s.id)
                      setMobileShowContent(true)
                    }}
                  >
                    <span className="material-symbols-outlined text-[18px]">{s.icon}</span>
                    <span>{s.label}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        </div>

        <div className={`flex-1 flex-col min-h-0 ${mobileShowContent ? 'flex' : 'hidden md:flex'}`}>
          <button
            className="md:hidden flex items-center gap-1 text-sm font-ui-semibold px-lg pt-md pb-sm shrink-0"
            style={{ color: '#0D9F6E' }}
            type="button"
            onClick={() => setMobileShowContent(false)}
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span> Settings
          </button>
          <div className="flex-1 overflow-y-auto">
            {activeSection === 'general' && <GeneralSection workspaceName={workspaceLabel} onLabelChange={setWorkspaceLabel} />}
            {activeSection === 'folders' && (
              <FoldersSection
                folders={folders}
                onEdit={(i) => setEditingIndex(i)}
                onDelete={(i) => setFolders((prev) => prev.filter((_, idx) => idx !== i))}
                onAdd={() => setEditingIndex(null)}
              />
            )}
            {activeSection === 'insights' && <InsightsSection />}
            {activeSection === 'integrations' && <IntegrationsSection workspaceName={workspaceLabel} />}
            {activeSection === 'notifications' && <NotificationsSection />}
            {activeSection === 'export' && <ExportSection />}
            {activeSection === 'members' && <MembersSection />}
            {activeSection === 'danger' && <DangerSection />}
          </div>
        </div>
      </div>

      <FolderEditorOverlay
        key={editingIndex ?? 'new'}
        open={editingIndex !== undefined}
        folder={editingFolder}
        onClose={() => setEditingIndex(undefined)}
        onSave={(folder) => {
          setFolders((prev) => {
            if (editingIndex === null || editingIndex === undefined) return [...prev, folder]
            const next = [...prev]
            next[editingIndex] = folder
            return next
          })
          setEditingIndex(undefined)
        }}
      />
    </div>
  )
}
