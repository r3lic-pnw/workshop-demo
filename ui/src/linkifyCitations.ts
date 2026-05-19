import type { SourceRef } from '../../shared/types'

/** Turn inline [N] citations into markdown links when we have the source URL. */
export function linkifyCitations(memo: string, sources: SourceRef[]): string {
  if (sources.length === 0) return memo

  const urlByIndex = new Map(sources.map((s) => [s.index, s.url]))

  return memo.replace(/\[(\d+)\](?!\()/g, (match, num) => {
    const url = urlByIndex.get(Number(num))
    return url ? `[${num}](${url})` : match
  })
}
