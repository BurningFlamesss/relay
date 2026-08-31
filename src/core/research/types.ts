import type { ResearchDepth, ResearchStatus, SourceCategory, SourceType, DocumentStatus, EvidenceType } from "#/generated/prisma/enums.ts"

export type {
    ResearchDepth,
    ResearchStatus,
    SourceCategory,
    SourceType,
    DocumentStatus,
    EvidenceType,
}

export interface ResearchQuestion {
    question: string
    depth: ResearchDepth
    maxIterations?: number
    maxSources?: number
    maxPages?: number
    constraints?: ResearchConstraints
}

export interface ResearchConstraints {
    freshnessDays?: number
    requiredCategories?: SourceCategory[]
    excludedDomains?: string[]
    preferredSources?: string[]
    language?: string
    region?: string
}

export interface ResearchPlan {
    question: string
    intent: string
    subQuestions: string[]
    searchQueries: SearchQuery[]
    sourceCategories: SourceCategory[]
    preferredSources: string[]
    freshnessRequirement: "recent" | "any" | "historical"
    depth: ResearchDepth
    estimatedSources: number
    estimatedIterations: number
}

export interface SearchQuery {
    query: string
    intent: "factual" | "comparative" | "exploratory" | "technical" | "financial" | "opinion"
    priority: number
    expectedSourceTypes: SourceCategory[]
}

export interface ResearchSource {
    id: string
    name: string
    domain: string
    url: string
    category: SourceCategory
    priority: number
    sourceType: SourceType
    enabled: boolean
    crawlPolicy?: CrawlPolicy
    relevanceScore?: number
    authorityScore?: number
    freshnessScore?: number
}

export interface CrawlPolicy {
    maxDepth: number
    maxPages: number
    allowedPaths?: string[]
    blockedPaths?: string[]
    allowedDomains?: string[]
    blockedDomains?: string[]
    waitFor?: string
    jsCode?: string
    respectRobotsTxt?: boolean
    rateLimitMs?: number
}

export interface SourceDiscoveryResult {
    sources: ResearchSource[]
    totalCandidates: number
    filteredCount: number
    duplicateCount: number
}

export interface ResearchDocument {
    id: string
    url: string
    canonicalUrl?: string
    title?: string
    description?: string
    author?: string
    publishedAt?: Date
    crawledAt: Date
    sourceId?: string
    domain: string
    content: string
    markdown?: string
    headings: string[]
    language?: string
    wordCount: number
    contentHash: string
    metadata: Record<string, unknown>
    status: DocumentStatus
    errorMessage?: string
}

export interface Evidence {
    id: string
    documentId: string
    claim: string
    supportingText: string
    evidenceType: EvidenceType
    relevance: number
    confidence: number
    location?: string
    startOffset?: number
    endOffset?: number
    citations: Citation[]
}

export interface Citation {
    id: string
    label: string
    url: string
    title?: string
    domain: string
    publishedAt?: Date
    snippet?: string
}

export interface ResearchFinding {
    id: string
    claim: string
    explanation: string
    evidenceIds: string[]
    confidence: "high" | "medium" | "low"
    category?: string
}

export interface Disagreement {
    topic: string
    positions: Array<{
        claim: string
        evidenceIds: string[]
        sourceCount: number
        confidence: "high" | "medium" | "low"
    }>
    resolution?: string
}

export interface ResearchReport {
    id: string
    title: string
    executiveSummary: string
    keyFindings: ResearchFinding[]
    detailedAnalysis: AnalysisSection[]
    disagreements: Disagreement[]
    limitations: string[]
    conclusion: string
    sources: SourceReference[]
    wordCount: number
    readingTimeMinutes: number
    createdAt: Date
}

export interface AnalysisSection {
    heading: string
    content: string
    evidenceIds: string[]
    subSections?: AnalysisSection[]
}

export interface SourceReference {
    id: string
    name: string
    domain: string
    url: string
    category: SourceCategory
    documentCount: number
    evidenceCount: number
    relevanceScore: number
    authorityScore: number
    freshnessScore: number
}

export interface ResearchJobState {
    id: string
    question: string
    depth: ResearchDepth
    status: ResearchStatus
    currentStage: string
    plan?: ResearchPlan
    sources: ResearchSource[]
    documents: ResearchDocument[]
    evidence: Evidence[]
    findings: ResearchFinding[]
    report?: ResearchReport
    iterationsDone: number
    creditsUsed: number
    errorMessage?: string
    createdAt: Date
    updatedAt: Date
    completedAt?: Date
}

export interface ResearchProgressEvent {
    stage: ResearchStage
    message: string
    progress?: number
    data?: Record<string, unknown>
    timestamp: number
}

export type ResearchStage =
    | "planning"
    | "discovering"
    | "selecting"
    | "crawling"
    | "normalizing"
    | "extracting"
    | "analyzing"
    | "synthesizing"
    | "completed"
    | "failed"

export const RESEARCH_STAGE_LABELS: Record<ResearchStage, string> = {
    planning: "Planning research",
    discovering: "Discovering sources",
    selecting: "Selecting sources",
    crawling: "Crawling sources",
    normalizing: "Normalizing documents",
    extracting: "Extracting evidence",
    analyzing: "Analyzing evidence",
    synthesizing: "Synthesizing report",
    completed: "Research completed",
    failed: "Research failed",
}

export interface ModelInvocationRecord {
    model: string
    role: string
    task: string
    promptTokens: number
    completionTokens: number
    totalTokens: number
    latencyMs: number
    success: boolean
    errorMessage?: string
    fallbackFrom?: string
}