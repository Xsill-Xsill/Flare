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
          content: `Extract 2-5 factual claims from the text.
            Each claim should be a single sentence stating something the founder believes,
            experienced, or observed. Return a JSON object of the shape {"claims": string[]}.
            Example: {"claims": ["Users keep asking for export before any other feature",
                      "The onboarding flow was rewritten three times this month"]}`,
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
