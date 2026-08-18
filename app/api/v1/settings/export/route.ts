import { NextRequest, NextResponse } from 'next/server'
import { and, asc, eq, inArray } from 'drizzle-orm'
import JSZip from 'jszip'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { chunks, itemTags, items, workspaces } from '@/lib/db/schema'

function itemTitle(item: { type: string; rawContent: string | null; sourceUrl: string | null }): string {
  const text = item.type === 'text' ? item.rawContent : item.sourceUrl
  if (!text) return 'Untitled'
  const firstLine = text.split('\n')[0].trim()
  const title = firstLine || text.trim()
  return title.length > 80 ? `${title.slice(0, 80)}…` : title
}

// YAML-safe: wrap in quotes and escape embedded quotes/backslashes.
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'note'
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const workspaceId = req.nextUrl.searchParams.get('workspaceId')
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
  }

  const [workspace] = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, user.id)))
    .limit(1)

  if (!workspace) return NextResponse.json({ error: 'workspace not found' }, { status: 404 })

  const workspaceItems = await db
    .select({
      id: items.id,
      type: items.type,
      rawContent: items.rawContent,
      sourceUrl: items.sourceUrl,
      folder: items.folder,
      createdAt: items.createdAt,
    })
    .from(items)
    .where(eq(items.workspaceId, workspaceId))
    .orderBy(asc(items.createdAt))

  const itemIds = workspaceItems.map((item) => item.id)

  const [chunkRows, tagRows] = itemIds.length
    ? await Promise.all([
        db
          .select({ itemId: chunks.itemId, content: chunks.content })
          .from(chunks)
          .where(inArray(chunks.itemId, itemIds))
          .orderBy(asc(chunks.createdAt)),
        db.select({ itemId: itemTags.itemId, tag: itemTags.tag }).from(itemTags).where(inArray(itemTags.itemId, itemIds)),
      ])
    : [[], []]

  const contentByItem = new Map<string, string[]>()
  for (const row of chunkRows) {
    const list = contentByItem.get(row.itemId) ?? []
    list.push(row.content)
    contentByItem.set(row.itemId, list)
  }

  const tagsByItem = new Map<string, string[]>()
  for (const row of tagRows) {
    const list = tagsByItem.get(row.itemId) ?? []
    list.push(row.tag)
    tagsByItem.set(row.itemId, list)
  }

  const zip = new JSZip()
  const usedFilenames = new Set<string>()

  for (const item of workspaceItems) {
    const title = itemTitle(item)
    const content = item.rawContent ?? (contentByItem.get(item.id) ?? []).join('\n\n')
    const tags = tagsByItem.get(item.id) ?? []
    const dateIso = item.createdAt.toISOString()

    const frontmatterLines = [
      '---',
      `title: ${yamlString(title)}`,
      `date: ${yamlString(dateIso)}`,
      `folder: ${item.folder ? yamlString(item.folder) : 'null'}`,
      `tags: [${tags.map(yamlString).join(', ')}]`,
      ...(item.sourceUrl ? [`source_url: ${yamlString(item.sourceUrl)}`] : []),
      '---',
      '',
    ]

    const markdown = `${frontmatterLines.join('\n')}${content}\n`

    const datePrefix = dateIso.slice(0, 10)
    let filename = `${datePrefix}-${slugify(title)}.md`
    let suffix = 2
    while (usedFilenames.has(filename)) {
      filename = `${datePrefix}-${slugify(title)}-${suffix}.md`
      suffix += 1
    }
    usedFilenames.add(filename)

    zip.file(filename, markdown)
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
  const workspaceSlug = slugify(workspace.name)

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${workspaceSlug}-export.zip"`,
    },
  })
}
