import { z } from 'zod'
import { CLAIMS_EXTRACTION_SYSTEM_PROMPT, claimsExtractionUserPrompt } from '@/lib/prompts/claims-extraction'

const ClaimsSchema = z.object({
  claims: z.array(z.string().min(10).max(300)).max(8),
})

export async function extractClaims(chunkText: string): Promise<string[]> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: CLAIMS_EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: claimsExtractionUserPrompt(chunkText) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.0,
    }),
  })

  if (!response.ok) {
    throw new Error(`Groq claim extraction failed: ${response.status} ${await response.text()}`)
  }

  const data = await response.json()

  let raw: unknown
  try {
    raw = JSON.parse(data.choices[0].message.content)
  } catch (err) {
    console.warn('extractClaims: Groq response was not valid JSON', err)
    return []
  }

  const result = ClaimsSchema.safeParse(raw)
  if (!result.success) {
    console.warn('extractClaims: response failed schema validation', result.error.flatten())
    return []
  }

  return result.data.claims
}
