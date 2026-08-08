import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { ingestItem } from '@/lib/inngest/functions/ingest-item'
import { runDetectors } from '@/lib/inngest/functions/run-detectors'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [ingestItem, runDetectors],
})
