// ── Embedding client ──────────────────────────────────────────────────────
// Uses OpenAI text-embedding-3-small (1536 dims) truncated to 384,
// or falls back to a zero vector if no API key is configured.
// The Elasticsearch index uses dims: 384.

const EMBED_DIM = 384;

export async function embedText(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // No embedding provider — return zero vector (lexical-only mode)
    return new Array(EMBED_DIM).fill(0);
  }

  const input = text.slice(0, 8192); // model token limit

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input,
      dimensions: EMBED_DIM,
      encoding_format: 'float',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embed error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}

// Batch embed — respects OpenAI rate limits with simple delay
export async function embedBatch(texts, delayMs = 60) {
  const results = [];
  for (const text of texts) {
    results.push(await embedText(text));
    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
  }
  return results;
}
