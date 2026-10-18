import { useEffect, useMemo, useState } from 'react'
import type { PhaseType, ScrapingSourceType } from '#/core/types'
import type { OperationLog, PhaseProgress } from '#/hooks/useProgressTracker'

const PHASE_ORDER: PhaseType[] = [
  'PREFLIGHT',
  'QUERY_ARCHITECTURE',
  'SIGNAL_SCRAPING',
  'SIGNAL_PREPROCESSING',
  'PROBLEM_CLUSTER_SYNTHESIS',
  'ITERATION_GATE',
  'OPPORTUNITY_QUALIFICATION',
  'COMPETITIVE_DEEP_DIVE',
  'MARKET_SIZING',
  'SCORING',
  'SYNTHESIS',
  'REPORT_ASSEMBLY',
  'DELIVERY',
  'RESEARCH_PLANNING',
  'RESEARCH_DISCOVERY',
  'RESEARCH_CRAWLING',
  'RESEARCH_EXTRACTION',
  'RESEARCH_ANALYSIS',
  'RESEARCH_SYNTHESIS',
  'RESEARCH_CITATION',
]

const PHASE_LABELS: Record<PhaseType, string> = {
  PREFLIGHT: 'Preflight Check',
  QUERY_ARCHITECTURE: 'Generating Search Queries',
  SIGNAL_SCRAPING: 'Scraping Sources',
  SIGNAL_PREPROCESSING: 'Processing Signals',
  PROBLEM_CLUSTER_SYNTHESIS: 'Clustering Problems',
  ITERATION_GATE: 'Evaluating Results',
  OPPORTUNITY_QUALIFICATION: 'Qualifying Opportunities',
  COMPETITIVE_DEEP_DIVE: 'Analyzing Competition',
  MARKET_SIZING: 'Sizing Market',
  SCORING: 'Scoring Results',
  SYNTHESIS: 'Synthesizing Report',
  REPORT_ASSEMBLY: 'Assembling Report',
  DELIVERY: 'Delivering Results',
  RESEARCH_PLANNING: 'Generating Research Plan',
  RESEARCH_DISCOVERY: 'Discovering Sources',
  RESEARCH_CRAWLING: 'Crawling Websites',
  RESEARCH_EXTRACTION: 'Extracting Evidence',
  RESEARCH_ANALYSIS: 'Analyzing Findings',
  RESEARCH_SYNTHESIS: 'Synthesizing Report',
  RESEARCH_CITATION: 'Adding Citations',
}

// The primary research pipeline, in order (rendered top-to-bottom).
const RESEARCH_PHASES: PhaseType[] = [
  'RESEARCH_PLANNING',
  'RESEARCH_DISCOVERY',
  'RESEARCH_CRAWLING',
  'RESEARCH_EXTRACTION',
  'RESEARCH_ANALYSIS',
  'RESEARCH_SYNTHESIS',
]

const SOURCE_ICONS: Partial<Record<ScrapingSourceType, string>> = {
  REDDIT: '🔴',
  HACKER_NEWS: '🟠',
  G2: '🔵',
  CAPTERRA: '🟢',
  TRUSTPILOT: '🟡',
  GITHUB_ISSUES: '⚫',
  STACK_OVERFLOW: '🟤',
  DEV_TO: '🔷',
  HASHNODE: '💜',
  LINKEDIN_JOBS: '🔵',
  PRODUCT_HUNT: '🟠',
  APP_STORE: '🔵',
}

interface ProgressTrackerProps {
  operations: OperationLog[]
  phases: [PhaseType, PhaseProgress][]
  currentPhase: PhaseType | null
  signalCount: number
  iteration: number
  isComplete: boolean
  hasError: boolean
  startedAt: number | null
  connected?: boolean
  lastEventAt?: number | null
  onClear?: () => void
}

export function ProgressTracker({
  operations,
  phases,
  currentPhase,
  signalCount,
  iteration,
  isComplete,
  hasError,
  startedAt,
  connected = false,
  lastEventAt,
  onClear,
}: ProgressTrackerProps) {
  // Re-render every second so elapsed time / "last update" stay live.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const phasesMap = useMemo(() => new Map(phases), [phases])
  const now = Date.now()
  const duration = startedAt ? now - startedAt : 0
  const sinceLastEvent = lastEventAt ? now - lastEventAt : null

  // Determine which pipeline to display (research vs analysis)
  const isResearch =
    currentPhase?.startsWith('RESEARCH_') ||
    phases.some(([p]) => p.startsWith('RESEARCH_'))
  const displayPhases = isResearch ? RESEARCH_PHASES : PHASE_ORDER.slice(0, 13)

  // URLs currently being crawled (START without a matching DONE/FAILED)
  const activeCrawls = useMemo(() => {
    const finished = new Set<string>()
    for (const op of operations) {
      if ((op.type === 'CRAWL_URL_DONE' || op.type === 'CRAWL_URL_FAILED') && op.url) {
        finished.add(op.url)
      }
    }
    const active: OperationLog[] = []
    const seen = new Set<string>()
    for (const op of operations) {
      if (op.type === 'CRAWL_URL_START' || op.type === 'SCRAPE_SOURCE_START') {
        const key = op.url ?? op.message
        if (seen.has(key)) continue
        if (op.url && finished.has(op.url)) continue
        seen.add(key)
        active.push(op)
      }
    }
    return active.slice(0, 6)
  }, [operations])

  // Distinct websites successfully crawled
  const crawledSites = useMemo(() => {
    const sites = new Map<string, string>()
    for (const op of operations) {
      if (op.type === 'CRAWL_URL_DONE' && op.url) {
        try {
          const host = new URL(op.url).hostname.replace(/^www\./, '')
          if (!sites.has(host)) sites.set(host, op.url)
        } catch {
          if (!sites.has(op.url)) sites.set(op.url, op.url)
        }
      }
    }
    return Array.from(sites.entries()).slice(0, 12)
  }, [operations])

  const getStatus = (phase: PhaseType): PhaseProgress['status'] =>
    phasesMap.get(phase)?.status ?? 'pending'

  const getOperationIcon = (type: OperationLog['type']) => {
    switch (type) {
      case 'PHASE_START': return '▶️'
      case 'PHASE_COMPLETE': return '✅'
      case 'PHASE_FAILED': return '❌'
      case 'SCRAPE_SOURCE_START': return '🔍'
      case 'SCRAPE_SOURCE_DONE': return '✅'
      case 'SCRAPE_SOURCE_FAILED': return '❌'
      case 'CRAWL_URL_START': return '🌐'
      case 'CRAWL_URL_DONE': return '📄'
      case 'CRAWL_URL_FAILED': return '⚠️'
      case 'AI_CALL_START': return '🤖'
      case 'AI_CALL_DONE': return '✨'
      case 'ITERATION_START': return '🔄'
      case 'ITERATION_COMPLETE': return '✅'
      case 'SIGNAL_COUNT_UPDATE': return '📊'
      case 'SOURCE_DISCOVERED': return '🔎'
      case 'EVIDENCE_EXTRACTED': return '📝'
      case 'DONE': return '🎉'
      case 'FATAL': return '💀'
      default: return '•'
    }
  }

  const formatDuration = (ms?: number | null) => {
    if (ms == null) return ''
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    const m = Math.floor(ms / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    return `${m}m ${s}s`
  }

  const formatTimestamp = (timestamp: number) =>
    new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })

  const completedPhases = displayPhases.filter(p => getStatus(p) === 'completed').length
  const failedCount = operations.filter(o => o.type.includes('FAILED') || o.type === 'FATAL').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold">
                {hasError ? 'Research Failed' : isComplete ? 'Research Complete' : 'Processing Research'}
              </h2>
              {/* Live connection badge */}
              {!isComplete && !hasError && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  connected ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    connected ? 'bg-green-500 animate-pulse' : 'bg-amber-500 animate-pulse'
                  }`} />
                  {connected ? 'Live' : 'Reconnecting…'}
                </span>
              )}
            </div>
            {currentPhase && (
              <p className="text-gray-600 mt-1">{PHASE_LABELS[currentPhase]}</p>
            )}
            {!isComplete && !hasError && sinceLastEvent != null && (
              <p className="text-xs text-gray-400 mt-1">
                Last activity {formatDuration(sinceLastEvent)} ago
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-blue-600">{signalCount}</div>
            <div className="text-sm text-gray-600">Items Processed</div>
          </div>
        </div>

        {/* Pipeline bar */}
        <div className="mb-2">
          <div className="flex items-center gap-1">
            {displayPhases.map((phase) => {
              const status = getStatus(phase)
              return (
                <div
                  key={phase}
                  className="flex-1 h-2 rounded-full transition-all"
                  style={{
                    backgroundColor:
                      status === 'completed' ? '#10B981'
                      : status === 'running' ? '#3B82F6'
                      : status === 'failed' ? '#EF4444'
                      : '#E5E7EB',
                  }}
                  title={PHASE_LABELS[phase]}
                />
              )
            })}
          </div>
          <div className="flex items-center justify-between text-sm text-gray-500 mt-2">
            <span>
              {iteration > 0 && `Iteration ${iteration} • `}
              {currentPhase ? PHASE_LABELS[currentPhase] : 'Starting…'}
            </span>
            <span>{completedPhases}/{displayPhases.length} phases</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="bg-gray-50 rounded p-3">
            <div className="text-sm text-gray-600">Operations</div>
            <div className="text-xl font-bold">{operations.length}</div>
          </div>
          <div className="bg-gray-50 rounded p-3">
            <div className="text-sm text-gray-600">Sites Crawled</div>
            <div className="text-xl font-bold">{crawledSites.length}</div>
          </div>
          <div className="bg-gray-50 rounded p-3">
            <div className="text-sm text-gray-600">Failed</div>
            <div className="text-xl font-bold text-red-600">{failedCount}</div>
          </div>
          <div className="bg-gray-50 rounded p-3">
            <div className="text-sm text-gray-600">Elapsed</div>
            <div className="text-xl font-bold">{formatDuration(duration) || '0s'}</div>
          </div>
        </div>
      </div>

      {/* Live "currently scraping" panel */}
      {!isComplete && !hasError && activeCrawls.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <h3 className="font-semibold text-blue-900">Currently Processing</h3>
          </div>
          <div className="space-y-1.5">
            {activeCrawls.map(op => (
              <div key={op.id} className="flex items-center gap-2 text-sm text-blue-900 font-mono">
                <span>🌐</span>
                <span className="truncate">{op.url || op.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sites crawled so far */}
      {crawledSites.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-bold mb-3">Websites Scraped ({crawledSites.length})</h3>
          <div className="flex flex-wrap gap-2">
            {crawledSites.map(([host, url]) => (
              <a
                key={host}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-xs text-gray-700"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                {host}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Phase details */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-bold mb-4">Phase Progress</h3>
        <div className="space-y-2">
          {displayPhases.map((phase) => {
            const progress = phasesMap.get(phase)
            const status = progress?.status ?? 'pending'
            return (
              <div
                key={phase}
                className={`flex items-center gap-3 p-3 rounded ${
                  status === 'running' ? 'bg-blue-50 border-2 border-blue-300' : ''
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${
                  status === 'completed' ? 'bg-green-500 text-white'
                  : status === 'running' ? 'bg-blue-500 text-white animate-pulse'
                  : status === 'failed' ? 'bg-red-500 text-white'
                  : 'bg-gray-200 text-gray-500'
                }`}>
                  {status === 'completed' ? '✓' : status === 'failed' ? '✗' : displayPhases.indexOf(phase) + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{PHASE_LABELS[phase]}</div>
                  {progress?.message && (
                    <div className="text-sm text-gray-600 truncate">{progress.message}</div>
                  )}
                </div>
                {progress?.completedAt && progress?.startedAt && (
                  <div className="text-sm text-gray-500 shrink-0">
                    {formatDuration(progress.completedAt - progress.startedAt)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Operations log */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Activity Log</h3>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500">{operations.length} events</div>
            {onClear && operations.length > 0 && (
              <button onClick={onClear} className="text-xs text-gray-400 hover:text-gray-600">
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1 max-h-[500px] overflow-y-auto font-mono text-sm">
          {operations.map((op) => (
            <div
              key={op.id}
              className={`flex items-start gap-2 p-2 rounded ${
                op.error || op.type === 'FATAL' ? 'bg-red-50'
                : op.type.includes('FAILED') ? 'bg-orange-50'
                : op.type === 'DONE' || op.type.includes('COMPLETE') ? 'bg-green-50'
                : ''
              }`}
            >
              <span className="text-gray-400 text-xs w-20 shrink-0 pt-0.5">
                {formatTimestamp(op.timestamp)}
              </span>
              <span className="text-base shrink-0">{getOperationIcon(op.type)}</span>
              {op.source && (
                <span className="text-base shrink-0" title={op.source}>
                  {SOURCE_ICONS[op.source] ?? '🌐'}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className={op.error ? 'text-red-700' : 'text-gray-700'}>{op.message}</div>
                {op.url && (
                  <a
                    href={op.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline truncate block"
                  >
                    {op.url}
                  </a>
                )}
                {op.error && <div className="text-xs text-red-600 mt-1">{op.error}</div>}
                <div className="flex gap-2 text-xs text-gray-500 mt-0.5">
                  {op.signalCount !== undefined && op.signalCount > 0 && (
                    <span>{op.signalCount} items</span>
                  )}
                  {op.duration !== undefined && <span>{formatDuration(op.duration)}</span>}
                </div>
              </div>
            </div>
          ))}

          {operations.length === 0 && (
            <div className="text-center text-gray-400 py-8">
              Waiting for the first update…
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
