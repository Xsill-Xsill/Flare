import { eq } from 'drizzle-orm'
import { inngest } from '@/lib/inngest/client'
import { db } from '@/lib/db'
import { chunks, claims, folders, items } from '@/lib/db/schema'
import { chunkText } from '@/lib/ingestion/chunk'
import { fetchUrlText, extractFileText } from '@/lib/ingestion/extract-text'
import { extractClaims } from '@/lib/ingestion/claims'
import { getEmbedding } from '@/lib/ingestion/embeddings'

const AUTO_SORT_CONTENT_CHARS = 500
const AUTO_SORT_TIMEOUT_MS = 8_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

// Best-effort — any failure here (bad response shape, network error, timeout) should leave
// the item unsorted, never break the pipeline. Callers treat a null return as "no pick".
async function askGroqForFolderName(folderList: string, noteContent: string): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AUTO_SORT_TIMEOUT_MS)

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0,
        max_tokens: 20,
        messages: [
          {
            role: 'system',
            content: `You are a filing assistant. Given a note and a list of folders, pick the single best folder for this note.
Reply with ONLY the exact folder name, nothing else.

Folders:
${folderList}`,
          },
          {
            role: 'user',
            content: `Note content (first ${AUTO_SORT_CONTENT_CHARS} chars): ${noteContent}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      console.warn(`auto-sort: Groq request failed with status ${response.status}`)
      return null
    }

    const payload: unknown = await response.json()
    if (!isRecord(payload) || !Array.isArray(payload.choices) || !isRecord(payload.choices[0])) return null
    const message = payload.choices[0].message
    if (!isRecord(message) || typeof message.content !== 'string') return null

    return message.content.trim() || null
  } catch (err) {
    console.warn('auto-sort: Groq request errored or timed out', err)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export const ingestItem = inngest.createFunction(
  {
    id: 'ingest-item',
    retries: 3,
    triggers: [{ event: 'item/created' }],
    onFailure: async ({ event }) => {
      const { itemId } = event.data.event.data as { itemId: string }
      await db.update(items).set({ status: 'failed' }).where(eq(items.id, itemId))
    },
  },
  async ({ event, step }) => {
    const { itemId } = event.data as { itemId: string }

    const item = await step.run('fetch-item', async () => {
      await db.update(items).set({ status: 'processing' }).where(eq(items.id, itemId))
      const [row] = await db.select().from(items).where(eq(items.id, itemId)).limit(1)
      if (!row) throw new Error(`item ${itemId} not found`)
      return row
    })

    if (item.hideFromAi) {
      await step.run('mark-done-hidden', async () => {
        await db.update(items).set({ status: 'done' }).where(eq(items.id, itemId))
      })
      return
    }

    const text = await step.run('extract-text', async () => {
      if (item.type === 'text') return item.rawContent ?? ''
      if (item.type === 'url') return fetchUrlText(item.sourceUrl!)
      if (item.type === 'file') return extractFileText(item.sourceUrl!)
      if (item.type === 'audio') return extractFileText(item.sourceUrl!)
      throw new Error(`unsupported item type for text extraction: ${item.type}`)
    })

    await step.run('auto-sort', async () => {
      // Never overwrite a folder the user (or anything else) already set.
      if (item.folder) return

      const workspaceFolders = await db
        .select({ id: folders.id, name: folders.name, description: folders.description })
        .from(folders)
        .where(eq(folders.workspaceId, item.workspaceId))

      if (workspaceFolders.length === 0) return

      const folderList = workspaceFolders.map((f) => `- ${f.name}${f.description ? ': ' + f.description : ''}`).join('\n')
      const pickedName = await askGroqForFolderName(folderList, text.slice(0, AUTO_SORT_CONTENT_CHARS))
      if (!pickedName) return

      const matched = workspaceFolders.find((f) => f.name.toLowerCase() === pickedName.toLowerCase())
      if (!matched) {
        console.warn('auto-sort: no match for', pickedName)
        return
      }

      await db.update(items).set({ folder: matched.name }).where(eq(items.id, itemId))
    })

    const textChunks = await step.run('chunk-text', async () => {
      return chunkText(text, { maxTokens: 500, overlap: 50 })
    })

    for (const chunk of textChunks) {
      await step.run(`process-chunk-${chunk.index}`, async () => {
        const embedding = await getEmbedding(chunk.content)

        const [savedChunk] = await db
          .insert(chunks)
          .values({
            itemId,
            content: chunk.content,
            tokenCount: chunk.tokenCount,
            embedding,
          })
          .returning()

        const statements = await extractClaims(chunk.content)
        if (statements.length > 0) {
          await db.insert(claims).values(
            statements.map((statement) => ({
              chunkId: savedChunk.id,
              itemId,
              statement,
            }))
          )
        }
      })
    }

    await step.run('mark-done', async () => {
      await db.update(items).set({ status: 'done' }).where(eq(items.id, itemId))
    })

    await step.run('trigger-detectors', async () => {
      await inngest.send({ name: 'detectors/run', data: { workspaceId: item.workspaceId } })
    })
  }
)
