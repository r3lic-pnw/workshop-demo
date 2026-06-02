/** Orchestrates a full research run and emits streamable progress events. */
import { buildQueries } from './queries.js'
import { searchOne } from './search.js'
import { buildIndexedArticles, toSourceRefs } from './sources.js'
import { synthesize } from './synthesize.js'
import type { ResearchEvent } from '../../shared/types.js'

/**
 * Runs the end-to-end research pipeline and emits progress events for the UI.
 */
export async function research(
  query: string,
  onEvent: (e: ResearchEvent) => void
): Promise<string> {
  const searches = buildQueries(query)
  onEvent({
    type: 'started',
    query,
    // Send the concrete search strings so the UI can show planned work.
    queries: searches.map((s) => s.query),
  })

  const results = await Promise.all(
    // Run all query variants concurrently and stream per-search status events.
    searches.map(async (spec, index) => {
      onEvent({ type: 'search:running', index })
      try {
        const result = await searchOne(query, spec, index)
        onEvent({ type: 'search:done', index, articleCount: result.articles.length })
        return result
      } catch (err) {
        onEvent({ type: 'search:failed', index, error: String(err) })
        throw err
      }
    })
  )

  onEvent({ type: 'sources', sources: toSourceRefs(buildIndexedArticles(results)) })
  onEvent({ type: 'synthesizing', message: 'All searches complete. Starting synthesis…' })
  // Forward synthesis progress and token chunks to the streaming client.
  const memo = await synthesize(query, results, (update) => {
    if (update.message) onEvent({ type: 'synthesizing', message: update.message })
    if (update.delta) onEvent({ type: 'synthesis:chunk', delta: update.delta })
  })
  onEvent({ type: 'done', memo })
  return memo
}
