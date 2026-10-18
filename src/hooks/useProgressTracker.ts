import { useEffect, useRef, useState, useCallback } from 'react'
import type { ProgressEvent, PhaseType, ScrapingSourceType } from '#/core/types'

export interface OperationLog {
  id: string
  type: ProgressEvent['type'] | 'SNAPSHOT'
  timestamp: number
  message: string
  source?: ScrapingSourceType
  url?: string
  error?: string
  duration?: number
  signalCount?: number
  metadata?: Record<string, unknown>
}

export interface PhaseProgress {
  phase: PhaseType
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt?: number
  completedAt?: number
  message?: string
}

export interface ProgressState {
  operations: OperationLog[]
  phases: [PhaseType, PhaseProgress][]
  currentPhase: PhaseType | null
  signalCount: number
  iteration: number
  isComplete: boolean
  hasError: boolean
  startedAt: number | null
  lastEventAt: number | null
  connected: boolean
}

const STORAGE_KEY_PREFIX = 'relay-progress-'

const INITIAL_STATE: ProgressState = {
  operations: [],
  phases: [],
  currentPhase: null,
  signalCount: 0,
  iteration: 0,
  isComplete: false,
  hasError: false,
  startedAt: null,
  lastEventAt: null,
  connected: false,
}

export interface UseProgressTrackerOptions {
  /** SSE endpoint. Defaults to `/api/stream/${jobId}` (analysis flow). */
  streamUrl?: string
  onComplete?: () => void
  onError?: (error: string) => void
  /** Maximum number of operations retained (default 200). */
  maxOperations?: number
  /** Persist progress so it survives reloads/navigation (default true). */
  persist?: boolean
}

export function useProgressTracker(
  jobId: string | null,
  options?: UseProgressTrackerOptions
) {
  const maxOperations = options?.maxOperations ?? 200
  const persist = options?.persist ?? true

  const [state, setState] = useState<ProgressState>(INITIAL_STATE)

  const esRef = useRef<EventSource | null>(null)
  const operationsRef = useRef<OperationLog[]>([])
  const phasesRef = useRef<Map<PhaseType, PhaseProgress>>(new Map())
  const maxSignalRef = useRef(0)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const store = typeof window !== 'undefined'
    ? (persist ? window.localStorage : window.sessionStorage)
    : null

  // Load persisted state whenever the job changes
  useEffect(() => {
    // Reset in-memory state first so switching jobs never shows stale data
    operationsRef.current = []
    phasesRef.current = new Map()
    maxSignalRef.current = 0
    setState(INITIAL_STATE)

    if (!jobId || !store) return

    const storageKey = STORAGE_KEY_PREFIX + jobId
    const savedState = store.getItem(storageKey)
    if (!savedState) return

    try {
      const parsed = JSON.parse(savedState) as Partial<ProgressState>
      operationsRef.current = parsed.operations ?? []
      phasesRef.current = new Map(parsed.phases ?? [])
      maxSignalRef.current = parsed.signalCount ?? 0

      setState({
        operations: parsed.operations ?? [],
        phases: parsed.phases ?? [],
        currentPhase: parsed.currentPhase ?? null,
        signalCount: parsed.signalCount ?? 0,
        iteration: parsed.iteration ?? 0,
        isComplete: parsed.isComplete ?? false,
        hasError: parsed.hasError ?? false,
        startedAt: parsed.startedAt ?? null,
        lastEventAt: parsed.lastEventAt ?? null,
        connected: false,
      })
    } catch (e) {
      console.error('Failed to load saved progress:', e)
    }
  }, [jobId, store])

  // Persist state whenever it changes
  useEffect(() => {
    if (!jobId || !store) return
    try {
      store.setItem(
        STORAGE_KEY_PREFIX + jobId,
        JSON.stringify({ ...state, operations: state.operations.slice(0, maxOperations) })
      )
    } catch {
      // localStorage may be full/unavailable - ignore
    }
  }, [jobId, store, state, maxOperations])

  const handleProgressEvent = useCallback((raw: Record<string, unknown>) => {
    const type = (raw.type as ProgressEvent['type']) ?? 'SNAPSHOT'
    const timestamp = (raw.timestamp as number) ?? Date.now()
    const message =
      (raw.message as string) ||
      getDefaultMessage(type, raw)

    const operation: OperationLog = {
      id: `${type}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      timestamp,
      message,
      source: raw.source as ScrapingSourceType | undefined,
      url: (raw.url as string) ?? extractUrl(raw.metadata),
      error: raw.error as string | undefined,
      duration: raw.duration as number | undefined,
      signalCount: raw.signalCount as number | undefined,
      metadata: raw.metadata as Record<string, unknown> | undefined,
    }

    operationsRef.current = [operation, ...operationsRef.current].slice(0, maxOperations)

    // Update phase map from explicit PHASE_* events
    const phase = raw.phase as PhaseType | undefined
    if (phase && (type === 'PHASE_START' || type === 'PHASE_COMPLETE' || type === 'PHASE_FAILED')) {
      const existing = phasesRef.current.get(phase)
      if (type === 'PHASE_START') {
        phasesRef.current.set(phase, {
          phase,
          status: 'running',
          startedAt: timestamp,
          message,
        })
      } else if (type === 'PHASE_COMPLETE') {
        phasesRef.current.set(phase, {
          phase,
          status: 'completed',
          startedAt: existing?.startedAt,
          completedAt: timestamp,
          message,
        })
        if (phasesRef.current.get(phase)?.status === 'failed') {
          // no-op: completed wins if it arrives after start
        }
      } else {
        phasesRef.current.set(phase, {
          phase,
          status: 'failed',
          startedAt: existing?.startedAt,
          completedAt: timestamp,
          message,
        })
      }
    }

    // Signal/source counts are published cumulatively - track the max seen.
    if (typeof raw.signalCount === 'number' && raw.signalCount > maxSignalRef.current) {
      maxSignalRef.current = raw.signalCount
    }

    setState(prev => ({
      operations: operationsRef.current,
      phases: Array.from(phasesRef.current.entries()),
      currentPhase: phase ?? prev.currentPhase,
      signalCount: maxSignalRef.current,
      iteration: (raw.iterationsDone as number) ?? prev.iteration,
      isComplete: type === 'DONE' || raw.stage === 'completed',
      hasError: type === 'FATAL' || raw.stage === 'failed' || prev.hasError,
      startedAt: prev.startedAt ?? timestamp,
      lastEventAt: timestamp,
      connected: true,
    }))

    if (type === 'DONE' || raw.stage === 'completed') {
      optionsRef.current?.onComplete?.()
    }
    if (type === 'FATAL' || raw.stage === 'failed') {
      optionsRef.current?.onError?.((raw.error as string) || 'Unknown error')
    }
  }, [maxOperations])

  // Connect to the SSE stream
  useEffect(() => {
    if (!jobId || state.isComplete) return

    let retryCount = 0
    const maxRetries = 8
    let cancelled = false

    const streamUrl = options?.streamUrl ?? `/api/stream/${jobId}`

    const connectSSE = () => {
      if (cancelled) return
      esRef.current?.close()

      const es = new EventSource(streamUrl)
      esRef.current = es

      es.onopen = () => {
        setState(prev => (prev.connected ? prev : { ...prev, connected: true }))
      }

      es.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data) as Record<string, unknown>
          handleProgressEvent(parsed)
          retryCount = 0
        } catch (err) {
          console.error('Failed to parse SSE:', err)
        }
      }

      es.onerror = () => {
        es.close()
        esRef.current = null
        setState(prev => ({ ...prev, connected: false }))

        if (retryCount < maxRetries) {
          retryCount++
          const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 15000)
          setTimeout(connectSSE, delay)
        }
      }
    }

    connectSSE()

    return () => {
      cancelled = true
      esRef.current?.close()
      esRef.current = null
    }
    // Re-run when the job changes or when the job completes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, state.isComplete, options?.streamUrl])

  const clearProgress = useCallback(() => {
    if (jobId && store) {
      store.removeItem(STORAGE_KEY_PREFIX + jobId)
    }
    operationsRef.current = []
    phasesRef.current = new Map()
    maxSignalRef.current = 0
    setState(INITIAL_STATE)
  }, [jobId, store])

  return {
    ...state,
    clearProgress,
  }
}

function extractUrl(metadata?: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined
  const meta = metadata as Record<string, unknown>
  const candidate = meta.url ?? meta.sourceUrl ?? meta.target
  return typeof candidate === 'string' ? candidate : undefined
}

function getDefaultMessage(type: string, raw: Record<string, unknown>): string {
  const source = raw.source ?? 'source'
  switch (type) {
    case 'PHASE_START':
      return `Starting ${raw.phase ?? 'phase'}...`
    case 'PHASE_COMPLETE':
      return `Completed ${raw.phase ?? 'phase'}`
    case 'PHASE_FAILED':
      return `Failed ${raw.phase ?? 'phase'}`
    case 'SCRAPE_SOURCE_START':
      return `Starting to scrape ${source}...`
    case 'SCRAPE_SOURCE_DONE':
      return `Finished scraping ${source}`
    case 'SCRAPE_SOURCE_FAILED':
      return `Failed to scrape ${source}`
    case 'CRAWL_URL_START':
      return `Crawling ${raw.url ?? 'URL'}...`
    case 'CRAWL_URL_DONE':
      return `Crawled ${raw.url ?? 'URL'} successfully`
    case 'CRAWL_URL_FAILED':
      return `Failed to crawl ${raw.url ?? 'URL'}`
    case 'AI_CALL_START':
      return 'Calling AI model...'
    case 'AI_CALL_DONE':
      return 'AI processing complete'
    case 'ITERATION_START':
      return `Starting iteration ${raw.iterationsDone}...`
    case 'ITERATION_COMPLETE':
      return `Completed iteration ${raw.iterationsDone}`
    case 'SIGNAL_COUNT_UPDATE':
      return `Found ${raw.signalCount ?? 0} signals`
    case 'SOURCE_DISCOVERED':
      return 'Discovered new source'
    case 'EVIDENCE_EXTRACTED':
      return 'Extracted evidence'
    case 'SNAPSHOT':
      return String(raw.message ?? 'Resuming...')
    case 'DONE':
      return 'Research completed successfully'
    case 'FATAL':
      return 'Research failed'
    default:
      return String(raw.message ?? 'Processing...')
  }
}
