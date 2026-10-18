import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { startResearchFn, getResearchJobFn, getResearchReportFn, getResearchSourcesFn, getResearchEvidenceFn, getUserResearchJobsFn } from '#/server/functions/research.tsx'
import { useProgressTracker } from '#/hooks/useProgressTracker'
import { ProgressTracker } from '#/components/ProgressTracker'

export const Route = createFileRoute('/research/')({
  beforeLoad({ context }) {
    if (!context.session) {
      throw redirect({ to: "/authenticate", search: { type: "signup" } })
    }
  },
  component: ResearchPage,
})

type ResearchStage = 
  | 'idle'
  | 'planning'
  | 'discovering'
  | 'crawling'
  | 'extracting'
  | 'analyzing'
  | 'synthesizing'
  | 'completed'
  | 'error'

interface ResearchJob {
  id: string
  question: string
  depth: string
  status: string
  currentStage?: string
  iterationsDone: number
  createdAt: string
  completedAt?: string
  plan?: any
  sources?: any[]
  documents?: any[]
  evidence?: any[]
  findings?: any[]
  report?: any
}

// Storage key for persisting active research
const ACTIVE_RESEARCH_KEY = 'relay-active-research'

// A job is "active" unless it has reached a terminal status.
const INACTIVE_STATUSES = ['COMPLETED', 'FAILED', 'CANCELLED']
const isActiveJob = (status: unknown): boolean =>
  typeof status === 'string' && !INACTIVE_STATUSES.includes(status)

interface PersistedResearch {
  jobId: string
  question: string
  stage: ResearchStage
  startedAt: number
}

function ResearchPage() {
  const [stage, setStage] = useState<ResearchStage>('idle')
  const [jobId, setJobId] = useState<string | null>(null)
  const [job, setJob] = useState<ResearchJob | null>(null)
  const [report, setReport] = useState<any>(null)
  const [sources, setSources] = useState<any[]>([])
  const [evidence, setEvidence] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<ResearchJob[]>([])
  const [activeTab, setActiveTab] = useState<'report' | 'sources' | 'evidence' | 'history' | 'progress'>('progress')
  const [question, setQuestion] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Use the progress tracker hook with persistence
  const progress = useProgressTracker(jobId, {
    streamUrl: jobId ? `/api/research/stream/${jobId}` : undefined,
    onComplete: () => {
      setStage('completed')
      loadResult(jobId!)
    },
    onError: (err) => {
      setError(err)
      setStage('error')
    },
  })

  // Load persisted research on mount
  useEffect(() => {
    loadHistory()
    loadPersistedResearch()
    
    return () => {
      // Cleanup handled by the hook
    }
  }, [])

  // Persist research state when it changes
  useEffect(() => {
    if (jobId && stage !== 'idle' && stage !== 'completed' && stage !== 'error') {
      persistResearch(jobId, question, stage)
    }
  }, [jobId, stage, question])

  const persistResearch = (jobId: string, question: string, stage: ResearchStage) => {
    const data: PersistedResearch = {
      jobId,
      question,
      stage,
      startedAt: Date.now(),
    }
    localStorage.setItem(ACTIVE_RESEARCH_KEY, JSON.stringify(data))
  }

  const clearPersistedResearch = () => {
    localStorage.removeItem(ACTIVE_RESEARCH_KEY)
  }

  const loadPersistedResearch = async () => {
    try {
      const saved = localStorage.getItem(ACTIVE_RESEARCH_KEY)
      if (!saved) return

      const data: PersistedResearch = JSON.parse(saved)

      const jobData = await getResearchJobFn({ jobId: data.jobId })

      // Job no longer exists - drop the stale pointer
      if (!jobData) {
        clearPersistedResearch()
        return
      }

      // Restore the question/job regardless of state
      setJobId(data.jobId)
      setQuestion(data.question)
      setJob(jobData as unknown as ResearchJob)
      if (inputRef.current) {
        inputRef.current.value = data.question
      }

      if (isActiveJob(jobData.status)) {
        // Resume live updates from where it left off
        setStage((jobData.currentStage as ResearchStage) || data.stage)
        setActiveTab('progress')
      } else if (jobData.status === 'COMPLETED') {
        // Finished while away - show the finished report
        setStage('completed')
        await loadResult(data.jobId)
      } else {
        setStage('error')
        setError('This research job did not complete.')
      }
    } catch (e) {
      console.error('Failed to load persisted research:', e)
      clearPersistedResearch()
    }
  }

  const loadHistory = async () => {
    try {
      const jobs = await getUserResearchJobsFn()
      if (jobs) setHistory(jobs)
    } catch (e) {
      console.error('Failed to load history:', e)
    }
  }

  const loadResult = async (jobId: string) => {
    try {
      const [jobData, reportData, sourcesData, evidenceData] = await Promise.all([
        getResearchJobFn({ jobId }),
        getResearchReportFn({ jobId }),
        getResearchSourcesFn({ jobId }),
        getResearchEvidenceFn({ jobId }),
      ])

      if (jobData) setJob(jobData)
      if (reportData) setReport(reportData)
      if (sourcesData) setSources(sourcesData)
      if (evidenceData) setEvidence(evidenceData)
      setActiveTab('report')
    } catch (e) {
      console.error('Failed to load result:', e)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const questionText = inputRef.current?.value.trim()
    if (!questionText) return

    setIsLoading(true)
    setError(null)
    setStage('planning')
    setJob(null)
    setReport(null)
    setSources([])
    setEvidence([])
    setQuestion(questionText)

    try {
      const { jobId: newJobId } = await startResearchFn({ 
        data: { question: questionText, depth: 'STANDARD' } 
      })
      setJobId(newJobId)
      setActiveTab('progress')
    } catch (e) {
      setError('Failed to start research. Please try again.')
      setStage('error')
      clearPersistedResearch()
    } finally {
      setIsLoading(false)
    }
  }

  const handleHistoryClick = async (selectedJob: ResearchJob) => {
    const jobStage = (selectedJob.currentStage as ResearchStage) ?? 'idle'
    setJobId(selectedJob.id)
    setJob(selectedJob)
    setQuestion(selectedJob.question)
    setStage(jobStage)
    // Persist the selection so it is restored on reload/navigation
    persistResearch(selectedJob.id, selectedJob.question, jobStage)

    if (selectedJob.status === 'COMPLETED') {
      await loadResult(selectedJob.id)
    } else if (isActiveJob(selectedJob.status)) {
      setActiveTab('progress')
      setStage(jobStage === 'idle' ? 'planning' : jobStage)
    }
  }

  const handleCancel = () => {
    if (confirm('Are you sure you want to cancel this research?')) {
      setJobId(null)
      setStage('idle')
      setJob(null)
      setReport(null)
      setSources([])
      setEvidence([])
      clearPersistedResearch()
      progress.clearProgress()
    }
  }

  const renderReport = () => {
    if (!report) return <div className="p-4 text-center text-gray-500">No report available</div>

    return (
      <div className="p-6 space-y-6 max-w-4xl">
        <h1 className="text-3xl font-bold">{report.title}</h1>
        
        <section>
          <h2 className="text-xl font-semibold mb-2">Executive Summary</h2>
          <p className="whitespace-pre-wrap">{report.executiveSummary}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Key Findings</h2>
          <div className="space-y-4">
            {report.keyFindings?.map((finding: any, i: number) => (
              <div key={i} className="border-l-4 border-blue-500 pl-4 py-2">
                <p className="font-medium">{finding.claim}</p>
                <p className="text-sm text-gray-600 mt-1">{finding.explanation}</p>
                <div className="flex gap-2 mt-2">
                  <span className={`px-2 py-1 text-xs rounded ${
                    finding.confidence === 'high' ? 'bg-green-100 text-green-800' :
                    finding.confidence === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {finding.confidence} confidence
                  </span>
                  {finding.evidenceIds?.map((eid: string, j: number) => (
                    <a key={j} href={`#evidence-${eid}`} className="text-xs text-blue-600 hover:underline">
                      [{j + 1}]
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Detailed Analysis</h2>
          <div className="space-y-6">
            {report.detailedAnalysis?.map((section: any, i: number) => (
              <div key={i}>
                <h3 className="text-lg font-medium mb-2">{section.heading}</h3>
                <p className="whitespace-pre-wrap">{section.content}</p>
                {section.subSections?.map((sub: any, j: number) => (
                  <div key={j} className="ml-4 mt-4">
                    <h4 className="font-medium">{sub.heading}</h4>
                    <p className="whitespace-pre-wrap">{sub.content}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        {report.disagreements?.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-2">Conflicting Evidence</h2>
            <div className="space-y-4">
              {report.disagreements.map((d: any, i: number) => (
                <div key={i} className="border border-orange-300 rounded-lg p-4 bg-orange-50">
                  <h4 className="font-medium text-orange-800">{d.topic}</h4>
                  {d.positions?.map((pos: any, j: number) => (
                    <div key={j} className="mt-2">
                      <p className="font-medium">Position {j + 1}: {pos.claim}</p>
                      <p className="text-sm text-gray-600">Sources: {pos.sourceCount} | Confidence: {pos.confidence}</p>
                    </div>
                  ))}
                  {d.resolution && <p className="mt-2 text-sm text-orange-700">Resolution: {d.resolution}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {report.limitations?.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-2">Limitations</h2>
            <ul className="list-disc list-inside space-y-1">
              {report.limitations.map((l: string, i: number) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="text-xl font-semibold mb-2">Conclusion</h2>
          <p className="whitespace-pre-wrap">{report.conclusion}</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Sources ({report.sources?.length || 0})</h2>
          <div className="space-y-2">
            {report.sources?.map((src: any, i: number) => (
              <div key={i} className="border rounded p-3">
                <a href={src.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                  {src.name} ({src.domain})
                </a>
                <div className="text-sm text-gray-600 mt-1">
                  Category: {src.category} | Documents: {src.documentCount} | Evidence: {src.evidenceCount}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    )
  }

  const renderSources = () => {
    if (!job?.sources?.length && !sources.length) {
      return <div className="p-4 text-center text-gray-500">No sources yet</div>
    }

    const displaySources = sources.length ? sources : job.sources
    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left border-b">
              <th className="p-2">Source</th>
              <th className="p-2">Domain</th>
              <th className="p-2">Category</th>
              <th className="p-2">Priority</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {displaySources.map((src: any, i: number) => (
              <tr key={i} className="border-b">
                <td className="p-2">
                  <a href={src.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {src.name}
                  </a>
                </td>
                <td className="p-2">{src.domain}</td>
                <td className="p-2">{src.category}</td>
                <td className="p-2">{src.priority}</td>
                <td className="p-2">{src.crawlStatus || 'pending'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const renderEvidence = () => {
    if (!evidence.length) {
      return <div className="p-4 text-center text-gray-500">No evidence extracted yet</div>
    }

    return (
      <div className="space-y-4 max-h-[600px] overflow-y-auto">
        {evidence.map((ev: any, i: number) => (
          <div key={ev.id || i} id={`evidence-${ev.id}`} className="border rounded p-4">
            <div className="flex gap-2 mb-2">
              <span className={`px-2 py-1 text-xs rounded ${
                ev.evidenceType === 'DIRECT_QUOTE' ? 'bg-blue-100 text-blue-800' :
                ev.evidenceType === 'STATISTICAL' ? 'bg-green-100 text-green-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {ev.evidenceType}
              </span>
              <span className="px-2 py-1 text-xs rounded bg-gray-100">
                Relevance: {(ev.relevance * 100).toFixed(0)}%
              </span>
              <span className="px-2 py-1 text-xs rounded bg-gray-100">
                Confidence: {(ev.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <p className="font-medium mb-1">{ev.claim}</p>
            <p className="text-sm text-gray-600 mb-2">{ev.supportingText.slice(0, 300)}...</p>
            <div className="text-xs text-gray-500">
              Source: {ev.document?.title || ev.document?.domain || 'Unknown'} ({ev.document?.url})
            </div>
          </div>
        ))}
      </div>
    )
  }

  const renderHistory = () => {
    if (!history.length) {
      return <div className="p-4 text-center text-gray-500">No previous research jobs</div>
    }

    return (
      <div className="space-y-2">
        {history.map((j: any) => (
          <div key={j.id} className="border rounded p-4 hover:bg-gray-50 cursor-pointer" onClick={() => handleHistoryClick(j)}>
            <div className="font-medium">{j.question.slice(0, 100)}...</div>
            <div className="flex gap-4 text-sm text-gray-600 mt-1">
              <span>Status: {j.status}</span>
              <span>Stage: {j.currentStage || 'N/A'}</span>
              <span>Iterations: {j.iterationsDone}</span>
              <span>{new Date(j.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">Relay Research</h1>
          <p className="text-gray-600">AI-powered research analyst with source-grounded citations</p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <section className="mb-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Research Question</label>
              <textarea
                ref={inputRef}
                placeholder="What are the current best approaches for building retrieval-augmented generation systems?"
                rows={3}
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading || (stage !== 'idle' && stage !== 'completed' && stage !== 'error')}
              />
            </div>

            <div className="flex gap-4">
              <select
                defaultValue="STANDARD"
                className="px-4 py-2 border rounded-lg"
                disabled={isLoading || (stage !== 'idle' && stage !== 'completed' && stage !== 'error')}
              >
                <option value="QUICK">Quick (1 iteration, 10 sources)</option>
                <option value="STANDARD">Standard (3 iterations, 30 sources)</option>
                <option value="DEEP">Deep (5 iterations, 50 sources)</option>
              </select>

              {stage === 'idle' || stage === 'completed' || stage === 'error' ? (
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Starting...' : 'Start Research'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Cancel Research
                </button>
              )}
            </div>
          </form>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
              {error}
            </div>
          )}
        </section>

        {/* Real-time progress tracker */}
        {jobId && stage !== 'idle' && (
          <section className="mb-8">
            <ProgressTracker
              operations={progress.operations}
              phases={progress.phases}
              currentPhase={progress.currentPhase}
              signalCount={progress.signalCount}
              iteration={progress.iteration}
              isComplete={progress.isComplete}
              hasError={progress.hasError}
              startedAt={progress.startedAt}
              connected={progress.connected}
              lastEventAt={progress.lastEventAt}
              onClear={progress.clearProgress}
            />
          </section>
        )}

        {(report || job) && (
          <section>
            <div className="border-b mb-4">
              <nav className="flex gap-4" role="tablist">
                {[
                  { key: 'progress', label: 'Progress', show: stage !== 'idle' && stage !== 'completed' },
                  { key: 'report', label: 'Report', show: true },
                  { key: 'sources', label: 'Sources', show: true },
                  { key: 'evidence', label: 'Evidence', show: true },
                  { key: 'history', label: 'History', show: true },
                ].filter(tab => tab.show).map(tab => (
                  <button
                    key={tab.key}
                    role="tab"
                    aria-selected={activeTab === tab.key}
                    onClick={() => setActiveTab(tab.key as any)}
                    className={`py-2 px-4 border-b-2 font-medium ${
                      activeTab === tab.key 
                        ? 'border-blue-600 text-blue-600' 
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              {activeTab === 'progress' && jobId && (
                <ProgressTracker
                  operations={progress.operations}
                  phases={progress.phases}
                  currentPhase={progress.currentPhase}
                  signalCount={progress.signalCount}
                  iteration={progress.iteration}
                  isComplete={progress.isComplete}
                  hasError={progress.hasError}
                  startedAt={progress.startedAt}
                  connected={progress.connected}
                  lastEventAt={progress.lastEventAt}
                  onClear={progress.clearProgress}
                />
              )}
              {activeTab === 'report' && renderReport()}
              {activeTab === 'sources' && renderSources()}
              {activeTab === 'evidence' && renderEvidence()}
              {activeTab === 'history' && renderHistory()}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
