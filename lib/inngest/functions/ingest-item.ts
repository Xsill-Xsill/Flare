import { eq } from 'drizzle-orm'
import { inngest } from '@/lib/inngest/client'
import { db } from '@/lib/db'
import { chunks, claims, items } from '@/lib/db/schema'
import { chunkText } from '@/lib/ingestion/chunk'
import { fetchUrlText, extractFileText } from '@/lib/ingestion/extract-text'
import { extractClaims } from '@/lib/ingestion/claims'
import { getEmbedding } from '@/lib/ingestion/embeddings'

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

    const text = await step.run('extract-text', async () => {
      if (item.type === 'text') return item.rawContent ?? ''
      if (item.type === 'url') return fetchUrlText(item.sourceUrl!)
      if (item.type === 'file') return extractFileText(item.sourceUrl!)
      throw new Error(`unsupported item type for text extraction: ${item.type}`)
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
  }
)
