import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { workspaces } from '@/lib/db/schema'
import { applyCors, preflightResponse } from '@/lib/http/cors'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const [workspace] = await db
    .insert(workspaces)
    .values({ ownerId: user.id, name })
    .returning()

  return NextResponse.json(workspace, { status: 201 })
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return applyCors(req, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

  const rows = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.ownerId, user.id))

  return applyCors(req, NextResponse.json(rows))
}

export async function OPTIONS(req: NextRequest) {
  return preflightResponse(req)
}
