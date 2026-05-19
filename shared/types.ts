export type Article = {
  title: string
  url: string
  text: string
  publishedDate?: string
}

export type SearchResult = {
  index: number
  query: string
  articles: Article[]
}

export type SourceRef = {
  index: number
  title: string
  url: string
}

export type ResearchEvent =
  | { type: 'started'; query: string; queries: string[] }
  | { type: 'search:running'; index: number }
  | { type: 'search:done'; index: number; articleCount: number }
  | { type: 'search:failed'; index: number; error: string }
  | { type: 'sources'; sources: SourceRef[] }
  | { type: 'synthesizing'; message: string }
  | { type: 'synthesis:chunk'; delta: string }
  | { type: 'done'; memo: string }
  | { type: 'failed'; error: string }
