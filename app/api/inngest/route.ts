import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { ingestItem } from '@/lib/inngest/functions/ingest-item'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [ingestItem],
})
