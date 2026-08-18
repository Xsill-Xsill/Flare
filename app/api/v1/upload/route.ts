import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { db } from '@/lib/db'
import { workspaces } from '@/lib/db/schema'

const ALLOWED_TYPES = new Set([
  'text/plain', // .txt
  'text/markdown', // .md
  'application/pdf', // .pdf
  'audio/mpeg', // .mp3
  'audio/wav', // .wav
  'audio/mp4', // .m4a
  'audio/x-m4a',
])
const ALLOWED_EXTENSIONS = new Set(['.txt', '.md', '.pdf', '.mp3', '.wav', '.m4a'])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a'])

const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024 // Groq Whisper's file-size limit
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 // non-audio cap

function getExtension(fileName: string): string | null {
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex === -1 ? null : fileName.slice(dotIndex).toLowerCase()
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file')
  const workspaceId = formData.get('workspaceId')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (typeof workspaceId !== 'string' || !workspaceId) {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
  }

  const extension = getExtension(file.name)
  if (!ALLOWED_TYPES.has(file.type) || !extension || !ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json(
      { error: 'Unsupported file type. Allowed: .txt, .md, .pdf, .mp3, .wav, .m4a' },
      { status: 400 }
    )
  }

  const isAudio = AUDIO_EXTENSIONS.has(extension)
  if (isAudio && file.size > MAX_AUDIO_SIZE_BYTES) {
    return NextResponse.json({ error: 'Audio files must be 25MB or smaller' }, { status: 400 })
  }
  if (!isAudio && file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: 'Files must be 20MB or smaller' }, { status: 400 })
  }

  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, user.id)))
    .limit(1)

  if (!workspace) {
    return NextResponse.json({ error: 'workspace not found' }, { status: 404 })
  }

  const path = `${workspaceId}/${Date.now()}-${file.name}`
  const admin = createAdminClient()
  const { error } = await admin.storage.from('uploads').upload(path, file)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ path }, { status: 201 })
}
