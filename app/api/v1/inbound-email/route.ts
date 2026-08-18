import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { items, workspaces } from '@/lib/db/schema'
import { inngest } from '@/lib/inngest/client'

// Resend's inbound-email webhook, verified with the Svix signing standard (no external
// package — just HMAC-SHA256 over `${svix-id}.${svix-timestamp}.${rawBody}` via node:crypto).
// MVP token resolution: the capture token IS the workspace id (capture+<workspaceId>@in.flare.app).
// A dedicated captureToken column is a follow-up — this route deliberately does not touch
// lib/db/schema.ts or add a migration.

const MAX_BODY_CHARS = 50_000
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type InboundEmail = {
  to: string[]
  from: string
  subject: string
  text?: string
  html?: string
}

function isInboundEmail(value: unknown): value is InboundEmail {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    Array.isArray(v.to) &&
    v.to.every((t) => typeof t === 'string') &&
    typeof v.from === 'string' &&
    typeof v.subject === 'string'
  )
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractToken(to: string[]): string | null {
  for (const address of to) {
    const match = address.match(/\+([^@]+)@/)
    if (match) return match[1]
  }
  return null
}

function verifySvixSignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  rawBody: string,
  svixSignatureHeader: string
): boolean {
  const secretBytes = Buffer.from(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret, 'base64')
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`
  const expected = createHmac('sha256', secretBytes).update(signedContent).digest()

  for (const part of svixSignatureHeader.split(' ')) {
    const [version, value] = part.split(',')
    if (version !== 'v1' || !value) continue

    let actual: Buffer
    try {
      actual = Buffer.from(value, 'base64')
    } catch {
      continue
    }
    if (actual.length === expected.length && timingSafeEqual(expected, actual)) return true
  }
  return false
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  const svixId = req.headers.get('svix-id')
  const svixTimestamp = req.headers.get('svix-timestamp')
  const svixSignature = req.headers.get('svix-signature')

  // Signature is computed over the exact raw bytes Resend sent — read the body as text
  // before any JSON parsing so nothing normalizes it first.
  const rawBody = await req.text()

  if (!secret || !svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const timestampSeconds = Number(svixTimestamp)
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > TIMESTAMP_TOLERANCE_SECONDS) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  if (!verifySvixSignature(secret, svixId, svixTimestamp, rawBody, svixSignature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const parsed: unknown = JSON.parse(rawBody)
  if (!isInboundEmail(parsed)) {
    return NextResponse.json({ ok: true })
  }

  const token = extractToken(parsed.to)
  if (!token || !UUID_RE.test(token)) {
    return NextResponse.json({ ok: true })
  }

  const [workspace] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, token)).limit(1)
  if (!workspace) {
    return NextResponse.json({ ok: true })
  }

  const body = (parsed.text ?? (parsed.html ? stripHtml(parsed.html) : '')).slice(0, MAX_BODY_CHARS)
  const rawContent = `${parsed.subject}\n\n${body}`

  const [item] = await db
    .insert(items)
    .values({
      workspaceId: workspace.id,
      type: 'text',
      rawContent,
      status: 'queued',
    })
    .returning()

  try {
    await inngest.send({ name: 'item/created', data: { itemId: item.id } })
  } catch (err) {
    console.error('inngest.send failed for item', item.id, err)
  }

  return NextResponse.json({ ok: true })
}
