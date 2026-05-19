import type { SourceRef } from '../../shared/types'

/** Linkify [N] in the memo body; Sources = one markdown link per article (title only, no raw URL). */
export function prepareMemoMarkdown(memo: string, sources: SourceRef[]): string {
  const body = stripSourcesSection(memo)
  const linkedBody =
    sources.length > 0 ? linkifyInlineCitations(body, sources) : body

  if (sources.length > 0) {
    const lines = buildSourceLines(sources)
    return `${linkedBody}\n\n## Sources\n${lines.join('\n')}\n`
  }

  if (/## Sources/i.test(memo)) {
    const block = extractSourcesBlock(memo)
    const lines = normalizeSourceLines(block)
    if (lines.length > 0) {
      return `${linkedBody}\n\n## Sources\n${lines.join('\n')}\n`
    }
  }

  return linkedBody
}

/** Replace [N] with [article title](url) in narrative sections. */
function linkifyInlineCitations(memo: string, sources: SourceRef[]): string {
  const byIndex = new Map(sources.map((s) => [s.index, s]))

  return memo.replace(/\[(\d+)\](?!\()/g, (match, num) => {
    const source = byIndex.get(Number(num))
    if (!source) return match
    const label = truncateTitle(source.title)
    return `[${escapeLinkLabel(label)}](${source.url})`
  })
}

function buildSourceLines(sources: SourceRef[]): string[] {
  return [...sources]
    .sort((a, b) => a.index - b.index)
    .map((s) => `${s.index}. [${escapeLinkLabel(s.title)}](${s.url})`)
}

function stripSourcesSection(memo: string): string {
  return memo.replace(/\n?## Sources[\s\S]*$/i, '').trimEnd()
}

function extractSourcesBlock(memo: string): string {
  const match = memo.match(/## Sources\s*([\s\S]*)$/i)
  return match?.[1]?.trim() ?? ''
}

/** Parse Claude's "N Title (url)" lines into markdown links. */
function normalizeSourceLines(block: string): string[] {
  const lines: string[] = []
  for (const raw of block.split('\n')) {
    const line = raw.trim()
    if (!line) continue

    const oneLine = line.match(/^(\d+)\s+(.+?)\s+\((https?:\/\/[^\)]+)\)\s*$/)
    if (oneLine) {
      lines.push(`${oneLine[1]}. [${escapeLinkLabel(oneLine[2].trim())}](${oneLine[3]})`)
      continue
    }

    const bracketed = line.match(/^\[(\d+)\]\s+(.+?)\s+\((https?:\/\/[^\)]+)\)\s*$/)
    if (bracketed) {
      lines.push(`${bracketed[1]}. [${escapeLinkLabel(bracketed[2].trim())}](${bracketed[3]})`)
      continue
    }

    const titleThenUrl = line.match(/^(\d+)\s+(.+)\n\((https?:\/\/[^\)]+)\)\s*$/s)
    if (titleThenUrl) {
      lines.push(
        `${titleThenUrl[1]}. [${escapeLinkLabel(titleThenUrl[2].trim())}](${titleThenUrl[3]})`
      )
    }
  }
  return lines
}

function truncateTitle(title: string, max = 52): string {
  const t = title.trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

function escapeLinkLabel(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]')
}
