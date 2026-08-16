import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transcribeAudio } from '@/lib/ingestion/transcribe-audio'

// Synchronous transcription with no item/storage side effects — used by the note editor to
// turn a voice recording into editable text right away (e.g. to fix mistranscriptions before
// saving), unlike POST /api/v1/audio which creates an item and transcribes it asynchronously
// via the Inngest pipeline.
const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024 // Groq Whisper's file-size limit

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const audio = formData.get('audio')

  if (!(audio instanceof File)) {
    return NextResponse.json({ error: 'audio is required' }, { status: 400 })
  }
  if (!audio.type.startsWith('audio/')) {
    return NextResponse.json({ error: 'audio must be an audio/* file' }, { status: 400 })
  }
  if (audio.size > MAX_AUDIO_SIZE_BYTES) {
    return NextResponse.json({ error: 'Audio files must be 25MB or smaller' }, { status: 400 })
  }

  try {
    const buffer = Buffer.from(await audio.arrayBuffer())
    const text = await transcribeAudio(buffer, audio.type)
    return NextResponse.json({ text })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Transcription failed' }, { status: 422 })
  }
}
