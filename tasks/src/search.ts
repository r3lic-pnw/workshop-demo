/** Runs Exa searches and intentionally injects transient failures for the demo. */
import { Exa } from 'exa-js'
import type { SearchResult } from '../../shared/types.js'
import type { SearchSpec } from './queries.js'

/** Builds an Exa client from the configured API key. */
function getExa(): Exa {
  const key = process.env.EXA_API_KEY
  if (!key) throw new Error('EXA_API_KEY is not set')
  return new Exa(key)
}

// 30% chance of throwing. This is the workshop demo mechanism.
// With 4 parallel searches, around 76% of v1 runs fail (1 - 0.7^4).
// In v2, Workflows retries each search up to 3 times, lifting per-run
// success rate to around 90%. Same flaky code, totally different outcome.
/** Injects random failure to simulate transient rate-limit behavior. */
function maybeFail(query: string) {
  if (Math.random() < 0.3) {
    throw new Error(`Exa rate limit hit on query: "${query}"`)
  }
}

/** Executes one Exa search spec and normalizes results into shared types. */
export async function searchOne(
  _topic: string,
  spec: SearchSpec,
  index: number
): Promise<SearchResult> {
  maybeFail(spec.query)

  const response = await getExa().searchAndContents(spec.query, {
    text: { maxCharacters: 2000 },
    numResults: 5,
    type: 'auto',
    ...(spec.startPublishedDate
      ? { startPublishedDate: spec.startPublishedDate }
      : {}),
  })

  return {
    index,
    query: spec.query,
    // Normalize Exa hits into the shared article shape used downstream.
    articles: response.results.map((r: (typeof response.results)[number]) => ({
      title: r.title ?? r.url,
      url: r.url,
      text: r.text ?? '',
      publishedDate: r.publishedDate,
    })),
  }
}
