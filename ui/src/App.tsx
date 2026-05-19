import { useCallback, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { renderSignupUrlWithUtms } from './lib/renderSignup'
import { prepareMemoMarkdown } from './linkifyCitations'
import type { SourceRef } from '../../shared/types'

const GITHUB_REPO = 'https://github.com/ojusave/workshop-demo'
const DEPLOY_URL = `https://render.com/deploy?repo=${GITHUB_REPO}`
const RENDER_ICON = 'https://render.com/icon.svg'
const GITHUB_ICON = 'https://github.githubassets.com/favicons/favicon.svg'
declare const __BUILD_ID__: string
const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'

type SearchSlot = {
  status: 'idle' | 'running' | 'success' | 'failed' | 'aborted'
  query?: string
  articleCount?: number
  error?: string
}

function abortInFlightSearches(searches: SearchSlot[]): SearchSlot[] {
  return searches.map((s) => {
    if (s.status === 'running' || s.status === 'idle') {
      return { ...s, status: 'aborted' as const }
    }
    return s
  })
}

type AppState = {
  runId: string | null
  status: 'idle' | 'running' | 'synthesizing' | 'done' | 'failed'
  searches: SearchSlot[]
  memo: string | null
  memoDraft: string | null
  activityLog: string[]
  synthesizeMessage: string
  sources: SourceRef[]
  error: string | null
  failedSearchCount: number
}

const initialSearches = (): SearchSlot[] =>
  Array.from({ length: 4 }, () => ({ status: 'idle' as const }))

const initialState: AppState = {
  runId: null,
  status: 'idle',
  searches: initialSearches(),
  memo: null,
  memoDraft: null,
  activityLog: [],
  synthesizeMessage: '',
  sources: [],
  error: null,
  failedSearchCount: 0,
}

type ResearchEvent = {
  type: string
  query?: string
  queries?: string[]
  index?: number
  articleCount?: number
  error?: string
  memo?: string
  message?: string
  delta?: string
  sources?: SourceRef[]
}

function useResearchStream(
  runId: string | null,
  onEvent: (event: ResearchEvent) => void
) {
  useEffect(() => {
    if (!runId) return
    const source = new EventSource(`/api/research/${runId}/events`)
    source.onmessage = (msg) => {
      const event = JSON.parse(msg.data) as ResearchEvent
      onEvent(event)
      if (event.type === 'done' || event.type === 'failed') source.close()
    }
    source.onerror = () => source.close()
    return () => source.close()
  }, [runId, onEvent])
}

function truncateQuery(q: string, max = 40): string {
  return q.length <= max ? q : `${q.slice(0, max - 1)}…`
}

function computeProgress(state: AppState): {
  percent: number
  label: string
  failed: boolean
} {
  if (state.status === 'idle') {
    return { percent: 0, label: '', failed: false }
  }
  if (state.status === 'synthesizing') {
    const draftLen = state.memoDraft?.length ?? 0
    const percent = Math.min(99, 82 + Math.floor(draftLen / 120))
    const label = state.synthesizeMessage || 'Writing memo…'
    return { percent, label, failed: false }
  }
  if (state.status === 'done') {
    return { percent: 100, label: 'Research complete', failed: false }
  }
  if (state.status === 'failed') {
    return { percent: 100, label: 'Research failed', failed: true }
  }

  const finished = state.searches.filter((s) =>
    ['success', 'failed', 'aborted'].includes(s.status)
  ).length
  const running = state.searches.some((s) => s.status === 'running')
  const hasQueries = state.searches.some((s) => s.query)

  if (!hasQueries) {
    return { percent: 8, label: 'Starting…', failed: false }
  }

  const percent = Math.min(78, 12 + finished * 16 + (running ? 6 : 0))
  return {
    percent,
    label: `Parallel searches: ${finished} of 4 finished`,
    failed: false,
  }
}

export default function App() {
  const [query, setQuery] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [state, setState] = useState<AppState>(initialState)

  const handleEvent = useCallback((event: ResearchEvent) => {
    setState((prev) => {
      if (
        (prev.status === 'failed' || prev.status === 'done') &&
        event.type !== 'started'
      ) {
        return prev
      }

      const next = { ...prev, searches: [...prev.searches] }

      if (event.type === 'started' && event.queries) {
        next.status = 'running'
        next.searches = event.queries.map((query) => ({
          status: 'idle' as const,
          query,
        }))
        return next
      }

      if (event.type === 'search:running' && event.index !== undefined) {
        next.searches[event.index] = {
          ...next.searches[event.index],
          status: 'running',
        }
        return next
      }

      if (event.type === 'search:done' && event.index !== undefined) {
        next.searches[event.index] = {
          ...next.searches[event.index],
          status: 'success',
          articleCount: event.articleCount,
        }
        return next
      }

      if (event.type === 'search:failed' && event.index !== undefined) {
        next.searches[event.index] = {
          ...next.searches[event.index],
          status: 'failed',
          error: event.error,
        }
        const succeeded = next.searches.filter((s) => s.status === 'success').length
        next.failedSearchCount = succeeded
        return next
      }

      if (event.type === 'sources' && event.sources) {
        next.sources = event.sources
        return next
      }

      if (event.type === 'synthesizing' && event.message) {
        next.status = 'synthesizing'
        next.synthesizeMessage = event.message
        if (!next.activityLog.includes(event.message)) {
          next.activityLog = [...next.activityLog, event.message]
        }
        return next
      }

      if (event.type === 'synthesis:chunk' && event.delta) {
        next.status = 'synthesizing'
        next.memoDraft = (prev.memoDraft ?? '') + event.delta
        return next
      }

      if (event.type === 'done' && event.memo) {
        next.status = 'done'
        next.memo = event.memo
        next.memoDraft = event.memo
        return next
      }

      if (event.type === 'failed') {
        next.status = 'failed'
        next.error = event.error ?? 'Research failed'
        next.searches = abortInFlightSearches(next.searches)
        next.failedSearchCount = next.searches.filter((s) => s.status === 'success').length
        return next
      }

      return prev
    })
  }, [])

  useResearchStream(state.runId, handleEvent)

  const runActive = state.status === 'running' || state.status === 'synthesizing'
  const showPipeline = state.status !== 'idle'
  const progress = computeProgress(state)

  async function startResearch() {
    const text = query.trim()
    if (!text) {
      setValidationError('Enter a research query')
      return
    }
    setValidationError(null)
    setState({
      ...initialState,
      searches: initialSearches(),
      status: 'running',
    })

    const res = await fetch('/api/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: text }),
    })
    if (!res.ok) {
      const body = (await res.json()) as { error?: string }
      setState((s) => ({
        ...s,
        status: 'failed',
        error: body.error ?? 'Could not start research',
      }))
      return
    }
    const { runId } = (await res.json()) as { runId: string }
    setState((s) => ({ ...s, runId }))
  }

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-white/10 bg-[#0a0a0a]">
        <div className="mx-auto flex max-w-[960px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <img
              src={RENDER_ICON}
              alt="Render"
              width={22}
              height={22}
              className="shrink-0"
            />
            <span className="text-sm font-semibold tracking-wide text-white">
              Ticker Research
            </span>
          </div>
          <a href={DEPLOY_URL} target="_blank" rel="noreferrer">
            <img
              src="https://render.com/images/deploy-to-render-button.svg"
              alt="Deploy to Render"
              height={26}
            />
          </a>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[960px] px-6 py-8">
        <section className="mb-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="AAPL, or any question: impact of datacenter buildout on utility stocks"
              rows={2}
              className="min-h-14 w-full flex-1 resize-y border border-white/10 bg-[#171717] px-4 py-3 text-lg text-white outline-none focus:border-violet-500"
              disabled={runActive}
            />
            <button
              type="button"
              className="dds-btn-primary h-14 shrink-0 px-8 text-base"
              onClick={() => void startResearch()}
              disabled={runActive}
            >
              Research
            </button>
          </div>
          {validationError && (
            <p className="mt-2 text-sm text-red-400">{validationError}</p>
          )}
          {!showPipeline && (
            <p className="mt-3 text-sm text-white/50">
              Four parallel Exa searches, then a Claude memo. Citations link to sources in the text.
            </p>
          )}
        </section>

        {showPipeline && (
          <>
            <ProgressBar
              percent={progress.percent}
              label={progress.label}
              failed={progress.failed}
              active={state.status === 'synthesizing'}
            />

            {state.activityLog.length > 0 && (
              <ActivityLog entries={state.activityLog} />
            )}

            <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {state.searches.map((search, i) => (
                <SearchCard key={i} index={i} search={search} />
              ))}
            </section>

            {(state.status === 'synthesizing' ||
              state.status === 'done' ||
              state.status === 'failed') && (
              <MemoPanel
                status={state.status}
                memo={state.status === 'done' ? state.memo : state.memoDraft}
                sources={state.sources}
                failed={state.status === 'failed'}
                error={state.error}
                failedSearchCount={state.failedSearchCount}
              />
            )}
          </>
        )}
        </div>
      </main>

      <footer className="shrink-0 border-t border-white/10 bg-[#0a0a0a]">
        <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-4 px-6 py-5 text-sm text-white/60">
          <span>
            Built for CascadiaJS 2026 workshop on Render Workflows
            <span className="ml-2 font-mono text-xs text-white/40">build {BUILD_ID}</span>
          </span>
          <div className="flex flex-wrap items-center gap-4">
          <a
            href={GITHUB_REPO}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-white/70 hover:text-white"
          >
            <img src={GITHUB_ICON} alt="" width={16} height={16} className="shrink-0" />
            GitHub
          </a>
          <a
            href={renderSignupUrlWithUtms('footer_link')}
            className="text-violet-400 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Sign up on Render
          </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

function ProgressBar({
  percent,
  label,
  failed,
  active,
}: {
  percent: number
  label: string
  failed: boolean
  active?: boolean
}) {
  return (
    <section className="mb-6" aria-live="polite">
      <div className="mb-2 flex items-center justify-between gap-4 text-sm">
        <span className={failed ? 'text-red-400' : 'text-white/80'}>{label}</span>
        <span className="shrink-0 font-mono tabular-nums text-white/50">{percent}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden bg-white/10">
        <div
          className={`h-full transition-all duration-300 ease-out ${
            failed ? 'bg-red-500' : 'bg-violet-500'
          } ${active && !failed ? 'animate-pulse-violet' : ''}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </section>
  )
}

function ActivityLog({ entries }: { entries: string[] }) {
  return (
    <section className="mb-8 border border-white/10 bg-white/[0.02] p-4">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-white/50">
        Live activity
      </h2>
      <ul className="space-y-2 font-mono text-xs text-white/70">
        {entries.map((entry, i) => (
          <li key={`${i}-${entry}`} className={i === entries.length - 1 ? 'text-violet-300' : ''}>
            {entry}
          </li>
        ))}
      </ul>
    </section>
  )
}

function SearchCard({ index, search }: { index: number; search: SearchSlot }) {
  const label = String(index + 1).padStart(2, '0')
  const statusLabel =
    search.status === 'idle'
      ? 'Queued'
      : search.status === 'running'
        ? 'Searching…'
        : search.status === 'success'
          ? 'Done'
          : search.status === 'aborted'
            ? 'Aborted'
            : 'Failed'

  const pillClass =
    search.status === 'idle'
      ? 'bg-white/10 text-white/60'
      : search.status === 'running'
        ? 'bg-violet-500/20 text-violet-300 animate-pulse-violet'
        : search.status === 'success'
          ? 'bg-green-500/20 text-green-300'
          : search.status === 'aborted'
            ? 'bg-white/10 text-white/50'
            : 'bg-red-500/20 text-red-300'

  return (
    <article className="dds-card flex flex-col p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="font-mono text-xs text-white/40">{label}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pillClass}`}>
          {statusLabel}
        </span>
      </div>
      <p className="mb-4 text-sm text-white/80">
        {search.query ? truncateQuery(search.query) : '…'}
      </p>
      <div className="h-6 text-xs text-white/50">
        {search.status === 'success' && `${search.articleCount ?? 0} articles found`}
        {search.status === 'failed' && (
          <span className="text-red-400">{search.error ?? 'Search failed'}</span>
        )}
        {search.status === 'aborted' && (
          <span className="text-white/40">Stopped when the run aborted</span>
        )}
      </div>
    </article>
  )
}

function MemoPanel({
  status,
  memo,
  sources,
  failed,
  error,
  failedSearchCount,
}: {
  status: AppState['status']
  memo: string | null
  sources: SourceRef[]
  failed: boolean
  error: string | null
  failedSearchCount: number
}) {
  const linkedMemo = memo ? prepareMemoMarkdown(memo, sources) : null

  return (
    <section className={`dds-card p-8 ${failed ? 'border-red-500/50' : ''}`}>
      {status === 'synthesizing' && !memo && (
        <p className="text-center text-sm text-white/60">Waiting for first tokens from Claude…</p>
      )}
      {linkedMemo && (
        <div className="prose prose-invert max-w-none prose-headings:text-white prose-headings:font-semibold prose-h1:text-3xl prose-h1:border-b prose-h1:border-white/10 prose-h1:pb-3 prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-a:text-violet-400 hover:prose-a:underline prose-strong:text-white prose-li:text-white/80">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noreferrer noopener">
                  {children}
                </a>
              ),
            }}
          >
            {linkedMemo}
          </ReactMarkdown>
        </div>
      )}
      {failed && (
        <div>
          <h2 className="mb-2 text-lg font-semibold text-red-400">Research failed</h2>
          <p className="mb-4 text-sm text-white/70">
            {failedSearchCount} of 4 searches succeeded but the run aborted
          </p>
          <pre className="overflow-x-auto rounded border border-white/10 bg-black/40 p-4 font-mono text-xs text-red-300">
            {error}
          </pre>
        </div>
      )}
    </section>
  )
}
