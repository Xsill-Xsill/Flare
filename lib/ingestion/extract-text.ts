import { createAdminClient } from '@/lib/supabase/admin'
import { transcribeAudio } from '@/lib/ingestion/transcribe-audio'

const AUDIO_EXTENSION_TO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.mp4': 'audio/mp4',
  '.m4a': 'audio/x-m4a',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
}

function resolveAudioMimeType(storagePath: string, blobType: string): string | null {
  if (blobType.startsWith('audio/')) return blobType
  const dotIndex = storagePath.lastIndexOf('.')
  if (dotIndex === -1) return null
  const extension = storagePath.slice(dotIndex).toLowerCase()
  return AUDIO_EXTENSION_TO_MIME[extension] ?? null
}

export async function fetchUrlText(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch URL ${url}: ${response.status}`)
  }
  const html = await response.text()
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function extractFileText(storagePath: string): Promise<string> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage.from('uploads').download(storagePath)
  if (error) {
    throw new Error(`Failed to download file ${storagePath}: ${error.message}`)
  }

  const audioMimeType = resolveAudioMimeType(storagePath, data.type)
  if (audioMimeType) {
    const buffer = Buffer.from(await data.arrayBuffer())
    return transcribeAudio(buffer, audioMimeType)
  }

  // MVP: .txt/.md read as plain text. PDF text extraction is not yet implemented.
  return data.text()
}
