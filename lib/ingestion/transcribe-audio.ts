const MIME_TO_EXTENSION: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'mp4',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

// Whisper-family models hallucinate on silence/noise/very short audio instead of returning
// empty text — typically by looping the same short phrase (often in a random language). A
// genuine transcript essentially never repeats an identical sentence 3+ times, so treat that
// pattern as "no real speech" rather than letting it flow downstream as real content.
function looksLikeHallucination(text: string): boolean {
  const segments = text
    .split(/[.,;:!?]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (segments.length < 3) return false

  const counts = new Map<string, number>()
  for (const segment of segments) counts.set(segment, (counts.get(segment) ?? 0) + 1)
  const maxCount = Math.max(...counts.values())

  return maxCount >= 3 && maxCount / segments.length >= 0.6
}

export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const extension = MIME_TO_EXTENSION[mimeType] ?? 'webm'

  const formData = new FormData()
  formData.append('file', new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), `audio.${extension}`)
  formData.append('model', 'whisper-large-v3-turbo')

  const startedAt = Date.now()
  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: formData,
  })
  const durationMs = Date.now() - startedAt

  if (!response.ok) {
    console.error(`transcribeAudio: Groq request failed after ${durationMs}ms (${audioBuffer.length} bytes, ${mimeType})`)
    throw new Error(`Groq transcription failed: ${response.status} ${await response.text()}`)
  }

  const payload: unknown = await response.json()
  const text = isRecord(payload) && typeof payload.text === 'string' ? payload.text.trim() : ''

  console.log(
    `transcribeAudio: Groq responded in ${durationMs}ms (${audioBuffer.length} bytes, ${mimeType}, ${text.length} chars transcribed)`
  )

  if (!text || looksLikeHallucination(text)) {
    throw new Error('No recognizable speech found in the audio')
  }

  return text
}
