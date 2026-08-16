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
        {
          role: 'system',
          content: `Extract up to 2-5 factual claims from the text below, but ONLY claims that are
            explicitly stated or directly implied by that exact text. Each claim must be
            traceable to specific words in the text — never invent, assume, or reuse claims
            from anywhere else, including this instruction.
            Each claim should be a single sentence stating something the founder believes,
            experienced, or observed.
            If the text is incoherent, gibberish, unintelligible, unrelated fragments, or
            otherwise contains no clear factual statement, return {"claims": []} — an empty
            list is a valid and expected answer, do not force claims that aren't there.
            Return a JSON object of the shape {"claims": string[]}, e.g. {"claims":
            ["<short factual statement 1>", "<short factual statement 2>"]} — that example
            shows the JSON shape only, not real content to copy.`,
        },
        { role: 'user', content: chunkText },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  })

  if (!response.ok) {
    throw new Error(`Groq claim extraction failed: ${response.status} ${await response.text()}`)
  }

  const data = await response.json()
  const parsed = JSON.parse(data.choices[0].message.content)
  return parsed.claims ?? []
}
