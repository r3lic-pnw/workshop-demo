/** Generates date-scoped query variants for a single research topic. */
import { researchDates } from './dates.js'

export type SearchSpec = {
  query: string
  startPublishedDate?: string
}

/** Builds the four fixed query variants used for each research run. */
export function buildQueries(topic: string): SearchSpec[] {
  const q = topic.trim()
  const { todayLabel, priceSince, newsSince, commentarySince } = researchDates()

  return [
    {
      query: `${q} stock price share price quote ${todayLabel}`,
      startPublishedDate: priceSince,
    },
    {
      query: `${q} breaking news ${todayLabel}`,
      startPublishedDate: newsSince,
    },
    {
      query: `${q} analyst commentary ${todayLabel}`,
      startPublishedDate: commentarySince,
    },
    {
      query: `${q} risks outlook ${todayLabel}`,
      startPublishedDate: commentarySince,
    },
  ]
}
