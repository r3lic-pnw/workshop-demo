/** Builds, ranks, and formats citation sources from raw search results. */
import type { Article, SearchResult, SourceRef } from '../../shared/types.js'

export type IndexedArticle = SourceRef & {
  publishedDate?: string
  text: string
}

/** Numbered sources for citations; order matches the synthesis prompt. */
export function buildIndexedArticles(results: SearchResult[]): IndexedArticle[] {
  // Flatten per-search article groups into one list before ranking by recency.
  const articles = sortByPublishedDesc(results.flatMap((r) => r.articles))
  // Assign stable 1-based citation numbers used as [N] in the memo.
  return articles.map((a, i) => ({
    index: i + 1,
    title: a.title,
    url: a.url,
    publishedDate: a.publishedDate,
    text: a.text,
  }))
}

/** Strips article text and published date, keeping citation metadata only. */
export function toSourceRefs(items: IndexedArticle[]): SourceRef[] {
  // Keep only fields needed by the UI source list and link rendering.
  return items.map(({ index, title, url }) => ({ index, title, url }))
}

/** Formats indexed sources into the structured block used in the LLM prompt. */
export function formatSourcesForPrompt(items: IndexedArticle[]): string {
  return items
    // Build one source block per article with citation id and raw excerpt.
    .map((a) => {
      const published = a.publishedDate?.trim() || 'unknown'
      return `[${a.index}] ${a.title}
URL: ${a.url}
Published: ${published}
${a.text}`
    })
    .join('\n\n---\n\n')
}

/** Orders articles newest-first so recent coverage is favored in synthesis. */
function sortByPublishedDesc(articles: Article[]): Article[] {
  // Compare parsed publish dates; missing/invalid dates sort to the end.
  return [...articles].sort((a, b) => {
    const ta = Date.parse(a.publishedDate ?? '') || 0
    const tb = Date.parse(b.publishedDate ?? '') || 0
    return tb - ta
  })
}
