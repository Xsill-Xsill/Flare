export async function getEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'voyage-3',
      input: [text],
    }),
  })

  if (!response.ok) {
    throw new Error(`Voyage embedding failed: ${response.status} ${await response.text()}`)
  }

  const data = await response.json()
  return data.data[0].embedding
}
