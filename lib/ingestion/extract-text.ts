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

export async function extractFileText(sourceUrl: string): Promise<string> {
  const response = await fetch(sourceUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch file ${sourceUrl}: ${response.status}`)
  }
  // MVP: .txt/.md read as plain text. PDF text extraction is not yet implemented.
  return response.text()
}
