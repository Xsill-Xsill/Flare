import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { PDFParse } from 'pdf-parse'
import { Agent, buildConnector, fetch, type Response } from 'undici'
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

function isPdf(storagePath: string, blobType: string): boolean {
  return blobType === 'application/pdf' || storagePath.toLowerCase().endsWith('.pdf')
}

const MIN_PDF_TEXT_LENGTH = 10

// pdf-parse v2 has no default function export (that was v1's API) — it exports the PDFParse
// class. `data` accepts a Buffer directly and converts it to a Uint8Array internally.
async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer })
  try {
    let result: Awaited<ReturnType<typeof parser.getText>>
    try {
      result = await parser.getText()
    } catch (err) {
      throw new Error('PDF text extraction failed', { cause: err })
    }
    // Catches both empty (image-only/encrypted PDFs) and near-empty extractions (e.g. a
    // scanned page whose only "text" is a page number) — neither is worth feeding downstream.
    if (result.text.trim().length < MIN_PDF_TEXT_LENGTH) {
      throw new Error('PDF text extraction failed')
    }
    return result.text
  } finally {
    await parser.destroy()
  }
}

const FETCH_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024 // 5 MB

// Blocks fetches to loopback/private/link-local addresses — most notably the cloud metadata
// endpoint (169.254.169.254) — so a URL capture can't be used to probe internal infrastructure
// (SSRF). Checked against the resolved IP, not just the hostname string, so "friendly" hostnames
// that resolve to internal addresses are caught too.
function isPrivateOrLinkLocalIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const octets = ip.split('.').map(Number)
    const [a, b] = octets
    if (a === 10) return true // 10.0.0.0/8
    if (a === 127) return true // 127.0.0.0/8 loopback
    if (a === 0) return true // "this network"
    if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local, incl. cloud metadata endpoint
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
    if (a === 192 && b === 168) return true // 192.168.0.0/16
    return false
  }
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase()
    if (lower === '::1') return true // loopback
    // fe80::/10 spans first-hextet fe80 through febf, not just the fe80 literal prefix —
    // compare the top 10 bits directly rather than string-matching "fe80:".
    const firstHextet = parseInt(lower.split(':')[0] || '', 16)
    if (!Number.isNaN(firstHextet) && firstHextet >> 6 === 0b1111111010) return true // fe80::/10 link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true // fc00::/7 unique local
    if (lower.startsWith('::ffff:')) {
      const mapped = lower.slice('::ffff:'.length)
      if (isIP(mapped) === 4) return isPrivateOrLinkLocalIp(mapped)
    }
    return false
  }
  return true // couldn't classify the address — fail closed
}

async function resolveSafeFetchTarget(url: string): Promise<{ hostname: string; address: string }> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Blocked URL fetch: unsupported protocol ${parsed.protocol}`)
  }
  const { address } = await lookup(parsed.hostname)
  if (isPrivateOrLinkLocalIp(address)) {
    throw new Error(`URL resolves to a private/internal address`)
  }
  return { hostname: parsed.hostname, address }
}

export async function fetchUrlText(url: string): Promise<string> {
  const { hostname, address } = await resolveSafeFetchTarget(url)

  const connect = buildConnector({})
  // Pin the socket to the IP validated above so attacker-controlled DNS cannot rebind between
  // the safety check and the TCP connection. The original hostname remains the Host/SNI value.
  const dispatcher = new Agent({
    connect(options, callback) {
      connect(
        {
          ...options,
          hostname: address,
          host: address,
          servername: hostname,
        },
        callback,
      )
    },
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    let response: Response
    try {
      // redirect: 'manual' so a same-origin-looking redirect can't be used to bounce the
      // already-pinned connection to a private IP without going back through the safety check.
      response = await fetch(url, { dispatcher, signal: controller.signal, redirect: 'manual' })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Fetching URL ${url} timed out after ${FETCH_TIMEOUT_MS}ms`)
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`Failed to fetch URL ${url}: ${response.status}`)
    }

    const contentLength = response.headers.get('content-length')
    if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
      await response.body?.cancel()
      throw new Error(`Response for ${url} exceeds the ${MAX_RESPONSE_BYTES} byte limit`)
    }

    const html = await readBodyWithLimit(response, MAX_RESPONSE_BYTES, controller)
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  } finally {
    await dispatcher.close()
  }
}

// Content-Length can be absent or lied about, so the body is also capped while streaming —
// abort as soon as we've read more than the limit instead of buffering an unbounded response.
async function readBodyWithLimit(response: Response, maxBytes: number, controller: AbortController): Promise<string> {
  if (!response.body) return response.text()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > maxBytes) {
      controller.abort()
      throw new Error(`Response exceeds the ${maxBytes} byte limit`)
    }
    chunks.push(value)
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf-8')
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

  if (isPdf(storagePath, data.type)) {
    const buffer = Buffer.from(await data.arrayBuffer())
    return extractPdfText(buffer)
  }

  // MVP: everything else (.txt/.md) read as plain text.
  return data.text()
}
