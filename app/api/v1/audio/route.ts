import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { db } from '@/lib/db'
import { items, workspaces } from '@/lib/db/schema'
import { inngest } from '@/lib/inngest/client'
import { validateUploadedFile } from '@/lib/http/file-validation'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const audio = formData.get('audio')
  const workspaceId = formData.get('workspaceId')

  if (!(audio instanceof File)) {
    return NextResponse.json({ error: 'audio is required' }, { status: 400 })
  }
  if (typeof workspaceId !== 'string' || !workspaceId) {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
  }

  const validation = await validateUploadedFile(audio)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status })
  }

  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, user.id)))
    .limit(1)

  if (!workspace) {
    return NextResponse.json({ error: 'workspace not found' }, { status: 404 })
  }

  const dotIndex = audio.name.lastIndexOf('.')
  const extension = dotIndex === -1 ? '.webm' : audio.name.slice(dotIndex)
  const path = `${workspaceId}/${Date.now()}-recording${extension}`

  const admin = createAdminClient()
  const { error: uploadError } = await admin.storage.from('uploads').upload(path, audio, {
    contentType: audio.type,
  })
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const [item] = await db
    .insert(items)
    .values({
      workspaceId,
      type: 'audio',
      sourceUrl: path,
      status: 'queued',
    })
    .returning()

  try {
    await inngest.send({ name: 'item/created', data: { itemId: item.id } })
  } catch (err) {
    console.error('inngest.send failed for item', item.id, err)
  }

  return NextResponse.json({ itemId: item.id, status: 'processing' }, { status: 201 })
}
