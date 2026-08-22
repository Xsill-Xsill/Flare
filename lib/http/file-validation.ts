// Shared upload validation: MIME allowlist checked against both the declared Content-Type
// and the file's actual magic bytes (a renamed .exe with Content-Type: text/plain would pass
// a header-only check), plus a size cap and a safe storage-key filename.

export const ALLOWED_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'application/pdf',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
])

const AUDIO_MIME_TYPES = new Set(['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg'])

// Capped at Groq Whisper's own hard limit, not a rounder/larger number — anything bigger would
// pass upload validation only to fail later in the async transcription step with no reprocess
// path (see lib/ingestion/transcribe-audio.ts), so it's better to reject it here, up front.
export const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

export function isAudioMimeType(mimeType: string): boolean {
  return AUDIO_MIME_TYPES.has(mimeType)
}

export function maxSizeForMimeType(mimeType: string): number {
  return isAudioMimeType(mimeType) ? MAX_AUDIO_SIZE_BYTES : MAX_FILE_SIZE_BYTES
}

function bytesStartWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((byte, i) => bytes[offset + i] === byte)
}

function matchesAscii(bytes: Uint8Array, text: string, offset = 0): boolean {
  return bytesStartWith(bytes, [...text].map((c) => c.charCodeAt(0)), offset)
}

// Text formats have no fixed magic-byte signature, so we only sanity-check that the head of
// the file doesn't look like binary garbage (a smuggled binary disguised as .txt/.md).
function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 512))
  let controlChars = 0
  for (const byte of sample) {
    if (byte === 0) return false // NUL byte never appears in real text
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) controlChars++
  }
  return controlChars / Math.max(sample.length, 1) < 0.05
}

// Verifies the first bytes of the file match the claimed MIME type's known signature, so a
// Content-Type header alone can't be used to smuggle a different file type past the allowlist.
export function matchesMagicBytes(bytes: Uint8Array, mimeType: string): boolean {
  switch (mimeType) {
    case 'application/pdf':
      return matchesAscii(bytes, '%PDF-')
    case 'audio/mpeg':
      // ID3 tag, or an MPEG frame sync (0xFFE0 with the 3 high bits of the second byte set)
      return matchesAscii(bytes, 'ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    case 'audio/mp4':
      return matchesAscii(bytes, 'ftyp', 4)
    case 'audio/wav':
    case 'audio/x-wav':
      return matchesAscii(bytes, 'RIFF') && matchesAscii(bytes, 'WAVE', 8)
    case 'audio/webm':
      return bytesStartWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])
    case 'audio/ogg':
      return matchesAscii(bytes, 'OggS')
    case 'text/plain':
    case 'text/markdown':
      return looksLikeText(bytes)
    default:
      return false
  }
}

export type FileValidationResult =
  | { ok: true }
  | { ok: false; status: 415; error: string }
  | { ok: false; status: 413; error: string }

export async function validateUploadedFile(file: File): Promise<FileValidationResult> {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { ok: false, status: 415, error: `Unsupported file type: ${file.type || 'unknown'}` }
  }

  const maxSize = maxSizeForMimeType(file.type)
  if (file.size > maxSize) {
    return { ok: false, status: 413, error: `File exceeds the ${Math.round(maxSize / (1024 * 1024))}MB limit` }
  }

  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  if (!matchesMagicBytes(head, file.type)) {
    return { ok: false, status: 415, error: 'File content does not match its declared type' }
  }

  return { ok: true }
}

// Storage keys are built as `${workspaceId}/${prefix}${sanitized}`, so the filename itself
// must never contain path separators or traversal sequences.
export function sanitizeFilenameForStorage(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? 'file'
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '')
  return cleaned.slice(-100) || 'file'
}
