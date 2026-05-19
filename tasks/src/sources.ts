import type { Article, SearchResult, SourceRef } from '../../shared/types.js'

export type IndexedArticle = SourceRef & {
  publishedDate?: string
  text: string
}

/** Numbered sources for citations; order matches the synthesis prompt. */
export function buildIndexedArticles(results: SearchResult[]): IndexedArticle[] {
  const articles = sortByPublishedDesc(results.flatMap((r) => r.articles))
  return articles.map((a, i) => ({
    index: i + 1,
    title: a.title,
    url: a.url,
    publishedDate: a.publishedDate,
    text: a.text,
  }))
}

export function toSourceRefs(items: IndexedArticle[]): SourceRef[] {
  return items.map(({ index, title, url }) => ({ index, title, url }))
}

export function formatSourcesForPrompt(items: IndexedArticle[]): string {
  return items
    .map((a) => {
      const published = a.publishedDate?.trim() || 'unknown'
      return `[${a.index}] ${a.title}
URL: ${a.url}
Published: ${published}
${a.text}`
    })
    .join('\n\n---\n\n')
}

function sortByPublishedDesc(articles: Article[]): Article[] {
  return [...articles].sort((a, b) => {
    const ta = Date.parse(a.publishedDate ?? '') || 0
    const tb = Date.parse(b.publishedDate ?? '') || 0
    return tb - ta
  })
}
