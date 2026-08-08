'use client'

import { useEffect, useMemo, useState } from 'react'
import { SidebarToggleButton } from '@/components/shell/SidebarToggleButton'
import { useWorkspace } from '@/components/shell/WorkspaceContext'
import { relativeTime } from '@/lib/format'
import type { EvidenceRef } from '@/lib/insights/types'

type Insight = {
  id: string
  detectorType: string
  title: string
  summary: string
  evidence: EvidenceRef[] | null
  createdAt: string
}

export function InsightsClient() {
  const workspace = useWorkspace()
  const [insights, setInsights] = useState<Insight[]>([])
  const [selectedInsightId, setSelectedInsightId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    async function loadInsights() {
      setLoading(true)
      try {
        const response = await fetch(`/api/v1/insights?workspaceId=${encodeURIComponent(workspace.id)}`, {
          signal: controller.signal,
        })
        const data: unknown = response.ok ? await response.json() : []
        if (!controller.signal.aborted) {
          const nextInsights = Array.isArray(data) ? data as Insight[] : []
          setInsights(nextInsights)
          setSelectedInsightId(nextInsights[0]?.id ?? null)
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setInsights([])
          setSelectedInsightId(null)
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void loadInsights()
    return () => controller.abort()
  }, [workspace.id])

  const visibleInsights = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return insights
    return insights.filter((insight) => `${insight.title} ${insight.summary}`.toLowerCase().includes(query))
  }, [insights, search])
  const selectedInsight = insights.find((insight) => insight.id === selectedInsightId) ?? null

  return (
    <div className="flex-1 h-screen overflow-hidden relative flex flex-col" style={{ ['--content-width' as string]: '860px' }}>
      <div className="flex items-center justify-between px-lg pt-lg pb-md shrink-0">
        <div className="flex items-center gap-1">
          <SidebarToggleButton />
          <h1 className="font-display-sm text-on-surface pl-1" style={{ fontSize: 22, fontWeight: 800 }}>
            Insights
          </h1>
        </div>
        <span className="hidden sm:inline font-metadata-mono text-metadata-mono text-on-surface-variant">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} ·{' '}
          {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="flex-1 flex min-h-0 border-t" style={{ borderColor: '#D8E2DC' }}>
        <div
          className="w-full md:w-[280px] shrink-0 md:border-r flex flex-col min-h-0 relative"
          style={{ borderColor: '#D8E2DC' }}
        >
          <div className="flex items-center justify-between px-md pt-md pb-sm shrink-0">
            <span className="font-label-caps text-label-caps text-outline">ALL INSIGHTS</span>
            <span className="bg-surface-container-highest text-on-surface-variant px-2 py-[2px] rounded-full text-xs font-bold">
              {insights.length}
            </span>
          </div>
          <div className="px-md pb-sm shrink-0">
            <div className="relative">
              <span
                className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px]"
                style={{ color: '#5C6F65' }}
              >
                search
              </span>
              <input
                className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-2 transition-all"
                placeholder="Search insights..."
                style={{ background: '#EEF2F0', border: '1px solid #D8E2DC', color: '#1A2620' }}
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto pb-md">
            {loading ? (
              <div className="space-y-2 px-md py-sm">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="h-[58px] rounded-lg animate-pulse" style={{ background: '#EEF2F0' }} />
                ))}
              </div>
            ) : visibleInsights.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-center text-sm px-md py-md" style={{ color: '#5C6F65' }}>
                  No insights yet.
                </p>
              </div>
            ) : (
              <div className="px-sm">
                {visibleInsights.map((insight) => {
                  const selected = insight.id === selectedInsightId
                  return (
                    <button
                      key={insight.id}
                      className={`w-full text-left rounded-lg px-sm py-2.5 transition-colors ${selected ? 'bg-surface-container-highest' : 'hover:bg-surface-container-highest/70'}`}
                      type="button"
                      onClick={() => setSelectedInsightId(insight.id)}
                    >
                      <p className="truncate text-sm font-ui-semibold" style={{ color: '#1A2620' }}>{insight.title}</p>
                      <p className="mt-1 text-[11px] font-metadata-mono" style={{ color: '#5C6F65' }}>{relativeTime(insight.createdAt)}</p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="hidden md:flex flex-1 flex-col min-h-0 relative">
          {selectedInsight ? (
            <div className="flex-1 overflow-y-auto">
              <article className="mx-auto px-lg py-xl" style={{ maxWidth: 'var(--content-width)' }}>
                <span className="font-label-caps text-label-caps text-[#0D9F6E]">{selectedInsight.detectorType.replace('-', ' ')}</span>
                <h2 className="mt-sm font-display-sm" style={{ fontSize: 28, fontWeight: 800, color: '#1A2620' }}>
                  {selectedInsight.title}
                </h2>
                <p className="mt-md text-sm leading-relaxed whitespace-pre-line" style={{ color: '#5C6F65' }}>
                  {selectedInsight.summary}
                </p>
                {selectedInsight.evidence && selectedInsight.evidence.length > 0 && (
                  <section className="mt-xl">
                    <h3 className="font-label-caps text-label-caps text-outline">EVIDENCE</h3>
                    <ul className="mt-sm space-y-2">
                      {selectedInsight.evidence.map((evidence) => (
                        <li key={evidence.claimId} className="rounded-lg border px-md py-sm text-sm" style={{ borderColor: '#D8E2DC', color: '#1A2620' }}>
                          {evidence.statement}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </article>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto flex items-center justify-center">
              <div className="mx-auto px-lg text-center" style={{ maxWidth: 'var(--content-width)' }}>
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-md" style={{ background: '#EEF2F0' }}>
                  <span className="material-symbols-outlined text-[26px]" style={{ color: '#0D9F6E' }}>auto_awesome</span>
                </div>
                <h2 className="font-display-sm mb-2" style={{ fontSize: 20, fontWeight: 700, color: '#1A2620' }}>No insights yet</h2>
                <p className="text-sm leading-relaxed" style={{ color: '#5C6F65' }}>
                  Check back after your next daily review — Flare surfaces patterns across your captures once there&apos;s enough to work with.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
