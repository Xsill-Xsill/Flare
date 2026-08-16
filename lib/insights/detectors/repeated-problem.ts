import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { chunks, claims, items } from '@/lib/db/schema'
import type { DetectorResult, EvidenceRef } from '@/lib/insights/types'

type ClaimRecord = EvidenceRef

type ClaimCluster = {
  problem: string
  claimIds: string[]
}

// Caps how many claims get sent to Groq per detector run. Sending an entire workspace's
// history risks blowing past the model's context window and driving up cost/latency as a
// workspace grows; 200 recent claims is enough headroom for repeated-problem clustering
// while keeping the prompt small and predictable.
const MAX_CLAIMS_FOR_DETECTION = 200

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function parseGroqContent(payload: unknown): unknown {
  if (!isRecord(payload) || !Array.isArray(payload.choices) || !isRecord(payload.choices[0])) {
    throw new Error('Groq returned an unexpected response shape')
  }
  const message = payload.choices[0].message
  if (!isRecord(message) || typeof message.content !== 'string') {
    throw new Error('Groq response did not contain message content')
  }
  return JSON.parse(message.content) as unknown
}

async function askGroq(system: string, user: string): Promise<unknown> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  })

  if (!response.ok) {
    throw new Error(`Groq repeated-problem detection failed: ${response.status} ${await response.text()}`)
  }

  const payload: unknown = await response.json()
  return parseGroqContent(payload)
}

function parseClusters(value: unknown): ClaimCluster[] {
  if (!isRecord(value) || !Array.isArray(value.clusters)) return []

  return value.clusters.flatMap((cluster) => {
    if (!isRecord(cluster) || typeof cluster.problem !== 'string' || !Array.isArray(cluster.claim_ids)) return []
    const claimIds = cluster.claim_ids.filter((claimId): claimId is string => typeof claimId === 'string')
    return claimIds.length > 0 ? [{ problem: cluster.problem, claimIds }] : []
  })
}

function parseInsightCopy(value: unknown): { title: string; summary: string } | null {
  if (!isRecord(value) || typeof value.title !== 'string' || typeof value.summary !== 'string') return null
  const title = value.title.trim()
  const summary = value.summary.trim()
  return title && summary ? { title, summary } : null
}

export async function detectRepeatedProblems(workspaceId: string): Promise<DetectorResult[]> {
  try {
    const claimRows = await db
      .select({ id: claims.id, itemId: claims.itemId, statement: claims.statement })
      .from(claims)
      .innerJoin(chunks, eq(claims.chunkId, chunks.id))
      .innerJoin(items, and(eq(claims.itemId, items.id), eq(chunks.itemId, items.id)))
      .where(and(eq(items.workspaceId, workspaceId), eq(items.status, 'done')))
      .orderBy(desc(claims.createdAt))
      .limit(MAX_CLAIMS_FOR_DETECTION)

    const itemIds = new Set(claimRows.map((claim) => claim.itemId))
    if (itemIds.size < 5) return []

    const claimRecords: ClaimRecord[] = claimRows.map((claim) => ({
      claimId: claim.id,
      itemId: claim.itemId,
      statement: claim.statement,
    }))
    const claimsById = new Map(claimRecords.map((claim) => [claim.claimId, claim]))

    const clustered = await askGroq(
      `You are analyzing a founder's notes to find recurring problems they keep mentioning.
Given a list of claims (each tagged with an item_id), identify groups of 3+ claims
from DIFFERENT item_ids that describe the same underlying problem.
Return JSON: {"clusters": [{"problem": string, "claim_ids": string[]}]}
Only return clusters where claim_ids span at least 3 distinct item_ids.
If no such clusters exist, return {"clusters": []}.`,
      `<claims>\n${JSON.stringify(claimRecords.map(({ claimId, itemId, statement }) => ({ claim_id: claimId, item_id: itemId, statement })))}\n</claims>`
    )

    const results: DetectorResult[] = []
    for (const cluster of parseClusters(clustered)) {
      if (results.length === 3) break

      const evidence = Array.from(new Set(cluster.claimIds))
        .map((claimId) => claimsById.get(claimId))
        .filter((claim): claim is ClaimRecord => Boolean(claim))
      if (evidence.length < 3 || new Set(evidence.map((claim) => claim.itemId)).size < 3) continue

      const copy = parseInsightCopy(
        await askGroq(
          `You are writing insight summaries for a founder's second brain app.
Be specific and concrete. Title: one sentence (fewer than 10 words). Summary: 2-3 sentences explaining the pattern and why it matters.
Return JSON: {"title": string, "summary": string}.`,
          `Problem cluster: ${cluster.problem}\nEvidence claims:\n${evidence.map((claim) => `- ${claim.statement}`).join('\n')}`
        )
      )
      if (copy) results.push({ ...copy, evidence })
    }

    return results
  } catch (error) {
    console.error('repeated-problem detector failed', error)
    return []
  }
}
