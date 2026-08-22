import { and, asc, cosineDistance, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { chunks, claims, items, workspaceSettings } from '@/lib/db/schema'
import type { DetectorResult, EvidenceRef } from '@/lib/insights/types'
import {
  REPEATED_PROBLEM_CLUSTER_SYSTEM_PROMPT,
  repeatedProblemClusterUserPrompt,
} from '@/lib/prompts/repeated-problem-cluster'
import {
  REPEATED_PROBLEM_SYNTHESIZE_SYSTEM_PROMPT,
  repeatedProblemSynthesizeUserPrompt,
} from '@/lib/prompts/repeated-problem-synthesize'

type ClaimRecord = EvidenceRef
type ClaimPoolRow = ClaimRecord & { chunkId: string; embedding: number[] | null }

// Caps how many claims are fetched from the DB per detector run, most-recent first. Sending an
// entire workspace's history risks blowing past the model's context window and driving up
// cost/latency as a workspace grows.
const MAX_CLAIMS_POOL = 200
// Caps how many claims from that pool actually get sent to Groq, after pre-clustering picks
// the most representative ones (see selectRepresentativeClaims).
const MAX_CLAIMS_FOR_CLUSTERING = 60
const MIN_CLAIMS_FOR_PRECLUSTERING = 15
// Both Groq calls in this detector use the same temperature, per the "repeated-problem
// detector" row in prompt_engineering_principles.md's Quick Reference table.
const DETECTOR_TEMPERATURE = 0.3

const ClusterSchema = z.object({
  clusters: z.array(
    z.object({
      problem: z.string().min(1),
      claim_ids: z.array(z.string()),
    })
  ),
})

const InsightCopySchema = z.object({
  title: z.string().min(1).max(80),
  summary: z.string().min(1).max(500),
})

type ClaimCluster = { problem: string; claimIds: string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function extractMessageContent(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.choices) || !isRecord(payload.choices[0])) {
    throw new Error('Groq returned an unexpected response shape')
  }
  const message = payload.choices[0].message
  if (!isRecord(message) || typeof message.content !== 'string') {
    throw new Error('Groq response did not contain message content')
  }
  return message.content
}

async function callGroq(
  system: string,
  user: string,
  userFocus: string | undefined,
  options: { jsonMode: boolean }
): Promise<string> {
  const systemWithFocus = userFocus ? `${system}\n\nUser focus: ${userFocus}` : system

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemWithFocus },
        { role: 'user', content: user },
      ],
      // The clustering call can't use strict JSON mode — it's asked to think out loud in
      // <thinking> tags before the JSON, and json_object mode requires the whole message to
      // be a single JSON object.
      ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      temperature: DETECTOR_TEMPERATURE,
    }),
  })

  if (!response.ok) {
    throw new Error(`Groq repeated-problem detection failed: ${response.status} ${await response.text()}`)
  }

  const payload: unknown = await response.json()
  return extractMessageContent(payload)
}

// The clustering prompt is asked to reason inside <thinking> tags before its JSON conclusion
// (chain-of-thought) — only the JSON after the closing tag is the actual answer.
function parseJsonAfterThinking(content: string): unknown {
  const closeTag = '</thinking>'
  const closeIndex = content.indexOf(closeTag)
  const jsonSlice = closeIndex === -1 ? content : content.slice(closeIndex + closeTag.length)
  return JSON.parse(jsonSlice.trim())
}

function parseClusters(value: unknown): ClaimCluster[] {
  const result = ClusterSchema.safeParse(value)
  if (!result.success) {
    console.warn('repeated-problem: cluster response failed schema validation', result.error.flatten())
    return []
  }
  return result.data.clusters
    .filter((cluster) => cluster.claim_ids.length > 0)
    .map((cluster) => ({ problem: cluster.problem, claimIds: cluster.claim_ids }))
}

function parseInsightCopy(value: unknown): { title: string; summary: string } | null {
  const result = InsightCopySchema.safeParse(value)
  if (!result.success) {
    console.warn('repeated-problem: insight copy response failed schema validation', result.error.flatten())
    return null
  }
  const title = result.data.title.trim()
  const summary = result.data.summary.trim()
  return title && summary ? { title, summary } : null
}

// Reduces the (up to 200) recent claims down to the ~60 most representative ones before they
// ever reach Groq — see prompt_engineering_principles.md §5.1 ("minimal high-signal context").
// Representativeness is measured as proximity to the centroid of the candidate pool's chunk
// embeddings: claims anchored in chunks near the centroid are the dense, on-topic core of the
// workspace, while claims from chunks far from the centroid are more likely one-off outliers.
async function selectRepresentativeClaims(pool: ClaimPoolRow[]): Promise<ClaimRecord[]> {
  const asRecords: ClaimRecord[] = pool.map(({ claimId, itemId, statement }) => ({ claimId, itemId, statement }))
  if (pool.length < MIN_CLAIMS_FOR_PRECLUSTERING) return asRecords

  const withEmbeddings = pool.filter(
    (row): row is ClaimPoolRow & { embedding: number[] } => Array.isArray(row.embedding) && row.embedding.length > 0
  )
  if (withEmbeddings.length < MIN_CLAIMS_FOR_PRECLUSTERING) {
    console.warn(
      `repeated-problem: only ${withEmbeddings.length}/${pool.length} claims have embeddings — skipping pre-clustering, falling back to the most recent ${MAX_CLAIMS_FOR_CLUSTERING}`
    )
    return asRecords.slice(0, MAX_CLAIMS_FOR_CLUSTERING)
  }

  const dimensions = withEmbeddings[0].embedding.length
  const centroid = new Array(dimensions).fill(0)
  for (const row of withEmbeddings) {
    for (let i = 0; i < dimensions; i++) centroid[i] += row.embedding[i]
  }
  for (let i = 0; i < dimensions; i++) centroid[i] /= withEmbeddings.length

  const chunkIds = Array.from(new Set(withEmbeddings.map((row) => row.chunkId)))
  const distance = cosineDistance(chunks.embedding, centroid)
  const rankedChunks = await db
    .select({ chunkId: chunks.id })
    .from(chunks)
    .where(inArray(chunks.id, chunkIds))
    .orderBy(asc(distance))

  const claimsByChunk = new Map<string, ClaimPoolRow[]>()
  for (const row of withEmbeddings) {
    const list = claimsByChunk.get(row.chunkId) ?? []
    list.push(row)
    claimsByChunk.set(row.chunkId, list)
  }

  const densest: ClaimPoolRow[] = []
  for (const { chunkId } of rankedChunks) {
    if (densest.length >= MAX_CLAIMS_FOR_CLUSTERING) break
    densest.push(...(claimsByChunk.get(chunkId) ?? []))
  }

  return densest.slice(0, MAX_CLAIMS_FOR_CLUSTERING).map(({ claimId, itemId, statement }) => ({ claimId, itemId, statement }))
}

export async function detectRepeatedProblems(workspaceId: string): Promise<DetectorResult[]> {
  try {
    const [settings] = await db
      .select({ insightsInstructions: workspaceSettings.insightsInstructions })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId))
      .limit(1)
    const userFocus = settings?.insightsInstructions?.trim() || undefined

    const pool = await db
      .select({
        claimId: claims.id,
        itemId: claims.itemId,
        statement: claims.statement,
        chunkId: claims.chunkId,
        embedding: chunks.embedding,
      })
      .from(claims)
      .innerJoin(chunks, eq(claims.chunkId, chunks.id))
      .innerJoin(items, and(eq(claims.itemId, items.id), eq(chunks.itemId, items.id)))
      .where(and(eq(items.workspaceId, workspaceId), eq(items.status, 'done')))
      .orderBy(desc(claims.createdAt))
      .limit(MAX_CLAIMS_POOL)

    const itemIds = new Set(pool.map((claim) => claim.itemId))
    if (itemIds.size < 5) return []

    const claimRecords = await selectRepresentativeClaims(pool)
    const claimsById = new Map(claimRecords.map((claim) => [claim.claimId, claim]))

    const clusterContent = await callGroq(
      REPEATED_PROBLEM_CLUSTER_SYSTEM_PROMPT,
      repeatedProblemClusterUserPrompt(
        JSON.stringify(claimRecords.map(({ claimId, itemId, statement }) => ({ claim_id: claimId, item_id: itemId, statement })))
      ),
      userFocus,
      { jsonMode: false }
    )

    let clustered: unknown
    try {
      clustered = parseJsonAfterThinking(clusterContent)
    } catch (err) {
      console.warn('repeated-problem: could not parse JSON after </thinking>', err)
      clustered = { clusters: [] }
    }

    const results: DetectorResult[] = []
    for (const cluster of parseClusters(clustered)) {
      if (results.length === 3) break

      const evidence = Array.from(new Set(cluster.claimIds))
        .map((claimId) => claimsById.get(claimId))
        .filter((claim): claim is ClaimRecord => Boolean(claim))
      if (evidence.length < 3 || new Set(evidence.map((claim) => claim.itemId)).size < 3) continue

      const synthesisContent = await callGroq(
        REPEATED_PROBLEM_SYNTHESIZE_SYSTEM_PROMPT,
        repeatedProblemSynthesizeUserPrompt(cluster.problem, evidence.map((claim) => `- ${claim.statement}`).join('\n')),
        userFocus,
        { jsonMode: true }
      )

      let copyJson: unknown
      try {
        copyJson = JSON.parse(synthesisContent)
      } catch (err) {
        console.warn('repeated-problem: insight copy response was not valid JSON', err)
        continue
      }

      const copy = parseInsightCopy(copyJson)
      if (copy) results.push({ ...copy, evidence })
    }

    return results
  } catch (error) {
    console.error('repeated-problem detector failed', error)
    return []
  }
}
