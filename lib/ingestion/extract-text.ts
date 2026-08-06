import { createAdminClient } from '@/lib/supabase/admin'

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
  // MVP: .txt/.md read as plain text. PDF text extraction is not yet implemented.
  return data.text()
}
