'use client'

import { useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '@/components/shell/WorkspaceContext'
import { SidebarToggleButton } from '@/components/shell/SidebarToggleButton'
import { useToast } from '@/components/shell/ToastProvider'
import { relativeTime } from '@/lib/format'
import { itemTitle, TYPE_ICON, type Item } from '../dashboard/DashboardClient'

type Chip = 'all' | 'folders' | 'notes'

type InboxItem = Item
type VaultItem = Item & { claims: string[] }

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

  useEffect(() => {
    fetch(`/api/v1/items?workspaceId=${workspace.id}&limit=100`)
      .then((res) => (res.ok ? res.json() : []))
      .then((items) => setInboxItems(Array.isArray(items) ? items : []))
      .catch(() => setInboxItems([]))
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
  }, [filterQuery, workspace.id])

  const filteredInboxItems = useMemo(() => {
    const q = inboxSearch.trim().toLowerCase()
    if (!q) return inboxItems
    return inboxItems.filter((item) => itemTitle(item).toLowerCase().includes(q))
  }, [inboxItems, inboxSearch])

  function notAvailableYet() {
    showToast("Vault editing isn't available yet - items land here once they've been sorted.", 'error')
  }

  return (
    <div className="p-lg max-w-[1280px] mx-auto w-full flex-1 flex flex-col gap-lg">
      {/* 0. UTILITY ROW */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <SidebarToggleButton />
          <div className="relative flex items-center gap-2 text-on-surface-variant w-full max-w-[20rem] min-w-0 pl-1">
            <span className="material-symbols-outlined text-[18px]">search</span>
            <input
              className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none p-0 text-sm placeholder:text-on-surface-variant"
              placeholder="Search your brain..."
              type="text"
            />
          </div>
        </div>
        <div className="flex items-center gap-md shrink-0">
          <span className="hidden sm:inline font-metadata-mono text-metadata-mono text-on-surface-variant">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} ·{' '}
            {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button
            className="text-on-surface-variant hover:text-primary transition-all active:opacity-80 p-sm rounded-full hover:bg-surface-container-highest"
            type="button"
            onClick={notAvailableYet}
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
          onClick={notAvailableYet}
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
            placeholder="Filter folders..."
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
          />
        </div>
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

      {/* 3. FOLDER GRID (empty - no vault/folders API yet) */}
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
              <article key={item.id} className="rounded-xl border border-outline-variant/60 bg-white px-md py-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-surface-container-highest flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant">{TYPE_ICON[item.type]}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="font-ui-semibold text-sm text-on-surface truncate">{itemTitle(item)}</h2>
                      {item.status !== 'done' && (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-ui-semibold ${
                          item.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-surface-container-highest text-on-surface-variant'
                        }`}>
                          {item.status === 'failed' ? 'failed' : 'processing…'}
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
    </div>
  )
}
