export type TextChunk = {
  index: number
  content: string
  tokenCount: number
}

export function chunkText(text: string, opts: { maxTokens: number; overlap: number }): TextChunk[] {
  const charsPerChunk = opts.maxTokens * 4
  const overlapChars = opts.overlap * 4
  const chunks: TextChunk[] = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + charsPerChunk, text.length)
    chunks.push({
      index: chunks.length,
      content: text.slice(start, end),
      tokenCount: Math.ceil((end - start) / 4),
    })
    if (end >= text.length) break
    start = end - overlapChars
  }

  return chunks
}
