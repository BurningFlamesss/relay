import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { startResearchFn, getResearchJobFn, getResearchReportFn, getResearchSourcesFn, getResearchEvidenceFn, getUserResearchJobsFn } from '#/server/functions/research.tsx'

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

const STAGE_LABELS: Record<ResearchStage, string> = {
  idle: 'Ready',
  planning: 'Planning research...',
  discovering: 'Discovering sources...',
  crawling: 'Crawling sources...',
  extracting: 'Extracting evidence...',
  analyzing: 'Analyzing evidence...',
  synthesizing: 'Synthesizing report...',
  completed: 'Research completed',
  error: 'Research failed',
}

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

function ResearchPage() {
  const [stage, setStage] = useState<ResearchStage>('idle')
  const [jobId, setJobId] = useState<string | null>(null)
  const [job, setJob] = useState<ResearchJob | null>(null)
  const [report, setReport] = useState<any>(null)
  const [sources, setSources] = useState<any[]>([])
  const [evidence, setEvidence] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<ResearchJob[]>([])
  const [activeTab, setActiveTab] = useState<'report' | 'sources' | 'evidence' | 'history'>('report')
  const esRef = useRef<EventSource | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    loadHistory()
    return () => esRef.current?.close()
  }, [])

  const loadHistory = async () => {
    try {
      const jobs = await getUserResearchJobsFn()
      if (jobs) setHistory(jobs)
    } catch (e) {
      console.error('Failed to load history:', e)
    }
  }

  const connectSSE = (jobId: string) => {
    if (esRef.current) {
      esRef.current.close()
    }

    const es = new EventSource(`/api/research/stream/${jobId}`)
    esRef.current = es

    let retryCount = 0

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        const newStage = data.stage as ResearchStage

        setStage(newStage)

        if (data.data) {
          setJob(prev => prev ? { ...prev, ...data.data } : null)
        }

        if (['completed', 'error'].includes(newStage)) {
          es.close()
          esRef.current = null
          if (newStage === 'completed') {
            loadResult(jobId)
          }
        }
      } catch (err) {
        console.error('Failed to parse SSE:', err)
      }
    }

    es.onerror = () => {
      if (retryCount < 3) {
        retryCount++
        es.close()
        esRef.current = null
        setTimeout(() => connectSSE(jobId), 1000 * retryCount)
        return
      }

      setStage('error')
      setError('Connection lost. Please try again.')
      es.close()
      esRef.current = null
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
    const question = inputRef.current?.value.trim()
    if (!question) return

    setIsLoading(true)
    setError(null)
    setStage('planning')
    setJob(null)
    setReport(null)
    setSources([])
    setEvidence([])

    try {
      const { jobId: newJobId } = await startResearchFn({ 
        data: { question, depth: 'STANDARD' } 
      })
      setJobId(newJobId)
      connectSSE(newJobId)
    } catch (e) {
      setError('Failed to start research. Please try again.')
      setStage('error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleHistoryClick = async (selectedJob: ResearchJob) => {
    setJobId(selectedJob.id)
    setJob(selectedJob)
    setStage(selectedJob.currentStage as ResearchStage ?? 'idle')
    
    if (selectedJob.status === 'COMPLETED') {
      await loadResult(selectedJob.id)
    } else if (selectedJob.status === 'RUNNING' || selectedJob.status === 'ITERATING') {
      connectSSE(selectedJob.id)
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
                disabled={isLoading}
              />
            </div>

            <div className="flex gap-4">
              <select
                defaultValue="STANDARD"
                className="px-4 py-2 border rounded-lg"
                disabled={isLoading}
              >
                <option value="QUICK">Quick (1 iteration, 10 sources)</option>
                <option value="STANDARD">Standard (3 iterations, 30 sources)</option>
                <option value="DEEP">Deep (5 iterations, 50 sources)</option>
              </select>

              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Starting...' : 'Start Research'}
              </button>
            </div>
          </form>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
              {error}
            </div>
          )}
        </section>

        {stage !== 'idle' && (
          <section className="mb-8">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-3 h-3 rounded-full ${
                  stage === 'completed' ? 'bg-green-500' :
                  stage === 'error' ? 'bg-red-500' :
                  'bg-blue-500 animate-pulse'
                }`}></div>
                <span className="font-medium">{STAGE_LABELS[stage]}</span>
                {jobId && <span className="text-sm text-gray-500">Job: {jobId.slice(0, 8)}...</span>}
              </div>

              <div className="space-y-2">
                {[
                  { key: 'planning', label: 'Research plan created' },
                  { key: 'discovering', label: 'Sources discovered' },
                  { key: 'crawling', label: 'Sources crawled' },
                  { key: 'extracting', label: 'Evidence extracted' },
                  { key: 'analyzing', label: 'Evidence analyzed' },
                  { key: 'synthesizing', label: 'Report synthesized' },
                ].map(s => (
                  <div key={s.key} className="flex items-center gap-2 text-sm">
                    <span className={`w-5 h-5 rounded-full border-2 ${
                      ['completed'].includes(stage) || 
                      (['planning', 'discovering', 'crawling', 'extracting', 'analyzing', 'synthesizing'].indexOf(stage) > 
                       ['planning', 'discovering', 'crawling', 'extracting', 'analyzing', 'synthesizing'].indexOf(s.key))
                        ? 'border-green-500 bg-green-500' :
                      stage === s.key ? 'border-blue-500' :
                      'border-gray-300'
                    }`}>
                      {['completed'].includes(stage) || 
                       (['planning', 'discovering', 'crawling', 'extracting', 'analyzing', 'synthesizing'].indexOf(stage) > 
                        ['planning', 'discovering', 'crawling', 'extracting', 'analyzing', 'synthesizing'].indexOf(s.key))
                        ? '✓' : ''}
                    </span>
                    <span className={stage === s.key ? 'font-medium' : 'text-gray-600'}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {(report || job) && (
          <section>
            <div className="border-b mb-4">
              <nav className="flex gap-4" role="tablist">
                {[
                  { key: 'report', label: 'Report' },
                  { key: 'sources', label: 'Sources' },
                  { key: 'evidence', label: 'Evidence' },
                  { key: 'history', label: 'History' },
                ].map(tab => (
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