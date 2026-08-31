export const QUEUE = {
    ORCHESTRATOR: "analysis-orchestrator",
    SCRAPER: "analysis-scraper",
    PREPROCESS: "analysis-preprocess",
    AI: "analysis-ai",
    SCORING: "analysis-scoring",
    DLQ: "analysis-dead-letter",
} as const

export const PHASE_ORDER = [
    "PREFLIGHT",
    "QUERY_ARCHITECTURE",
    "SIGNAL_SCRAPING",
    "SIGNAL_PREPROCESSING",
    "PROBLEM_CLUSTER_SYNTHESIS",
    "ITERATION_GATE",
    "OPPORTUNITY_QUALIFICATION",
    "COMPETITIVE_DEEP_DIVE",
    "MARKET_SIZING",
    "SCORING",
    "SYNTHESIS",
    "REPORT_ASSEMBLY",
    "DELIVERY",
    "RESEARCH_PLANNING",
    "RESEARCH_DISCOVERY",
    "RESEARCH_CRAWLING",
    "RESEARCH_EXTRACTION",
    "RESEARCH_ANALYSIS",
    "RESEARCH_SYNTHESIS",
    "RESEARCH_CITATION"
]

export type PhaseType = "PREFLIGHT" |
    "QUERY_ARCHITECTURE" |
    "SIGNAL_SCRAPING" |
    "SIGNAL_PREPROCESSING" |
    "PROBLEM_CLUSTER_SYNTHESIS" |
    "ITERATION_GATE" |
    "OPPORTUNITY_QUALIFICATION" |
    "COMPETITIVE_DEEP_DIVE" |
    "MARKET_SIZING" |
    "SCORING" |
    "SYNTHESIS" |
    "REPORT_ASSEMBLY" |
    "DELIVERY" |
    "RESEARCH_PLANNING" |
    "RESEARCH_DISCOVERY" |
    "RESEARCH_CRAWLING" |
    "RESEARCH_EXTRACTION" |
    "RESEARCH_ANALYSIS" |
    "RESEARCH_SYNTHESIS" |
    "RESEARCH_CITATION"


export type AnalysisTier = "LOW" | "MID" | "HIGH";
export type JobStatus = "QUEUED" | "RUNNING" | "ITERATING" | "COMPLETED" | "FAILED" | "CANCELLED" | "REFUNDED";
export type PhaseStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";
export type ScrapingSourceType =
    | "REDDIT" | "HACKER_NEWS" | "G2" | "CAPTERRA" | "TRUSTPILOT"
    | "GITHUB_ISSUES" | "STACK_OVERFLOW" | "DEV_TO" | "HASHNODE"
    | "LINKEDIN_JOBS" | "PRODUCT_HUNT" | "APP_STORE";
export type SignalIntentLabel = "COMPLAINT" | "WORKAROUND" | "DEMAND" | "COMPETITOR" | "FAILURE_POST" | "FEATURE_REQUEST";
export type AuthorType = "DEVELOPER" | "BUSINESS_OWNER" | "CONSUMER" | "STUDENT" | "UNKNOWN";

export interface RawSignal {
    url: string;
    urlHash: string;
    title?: string;
    quote: string;
    authorHandle?: string;
    publishedAt?: string;
}

export interface ScrapeOptions {
    jobId: string;
    maxSignals: number;
    excludedDomainHashes: Set<string>;
}

export interface SourceAdapter {
    readonly source: ScrapingSourceType;
    readonly rateLimit: number;
    scrape: (
        queries: Array<{ query: string; intentLabel: SignalIntentLabel }>,
        options: ScrapeOptions,
    ) => Promise<RawSignal[]>;
}


export interface OrchestratorJobData {
    jobId: string;
    userId: string;
    topic: string;
    topicHash: string;
    tier: AnalysisTier;
    maxIterations: number;
    filters?: {
        industries?: string[];
        regions?: string[];
        excludeKeywords?: string[];
        steeringConstraints?: string[];
    };
    isRerun?: boolean;
    parentJobId?: string;
}

export interface ScraperJobData {
    jobId: string;
    scrapeJobId: string;
    source: ScrapingSourceType;
    queries: Array<{ query: string; intentLabel: SignalIntentLabel }>;
    topicHash: string;
    userId: string;
    iterationNumber: number;
    excludedDomainHashes: string[];
}

export interface PreprocessJobData {
    jobId: string;
    signalIds: string[];
    batchIndex: number;
    totalBatches: number;
}

export interface AIJobData {
    jobId: string;
    task: AITaskType;
    payload: Record<string, unknown>;
    cacheKey?: string;
}

export type AITaskType =
    | "QUERY_ARCHITECTURE"
    | "DRILL_DOWN_QUERIES"
    | "CLUSTER_LABELING"
    | "WHY_NOW"
    | "COMPETITOR_ANALYSIS"
    | "SYNTHESIS";

export interface ScoringJobData {
    jobId: string;
    clusterIds: string[];
}


export interface QueryArchitectureResult {
    queries: Array<{
        query: string;
        intentLabel: SignalIntentLabel;
        reasoning: string;
    }>;
    negativeContextUsed: boolean;
}

export interface ScraperResult {
    source: ScrapingSourceType;
    signalCount: number;
    redisKey: string;
    skippedCount: number;
    durationMs: number;
}

export interface PreprocessBatchResult {
    processed: number;
    demandSignalsFound: number;
    batchIndex: number;
}

export interface ClusterLabelingResult {
    clusters: Array<{
        clusterId: string;
        label: string;
        personaSketches: Array<{ authorType: AuthorType; description: string }>;
        failedWorkarounds: string[];
        evidenceChain: Array<{ url: string; quote: string; source: ScrapingSourceType; authorType: AuthorType; date: string | null }>;
        demandSignalCount: number;
        compositeScore: number;
    }>;
}

export interface ScoringResult {
    candidates: Array<{
        candidateId: string;
        problemScore: number;
        competitionScore: number;
        marketScore: number;
        timingScore: number;
        compositeScore: number;
        scoringBreakdown: Record<string, unknown>;
    }>;
    topScore: number;
    meetsThreshold: boolean;
}

export interface SynthesisResult {
    problemStatement: string;
    targetPersona: string;
    solutionHypothesis: string;
    mvpScope: string;
    differentiationAngle: string;
    goToMarketChannel: string;
    riskFactors: Array<{ risk: string; source: string; severity: "LOW" | "MED" | "HIGH" }>;
    confidenceLevels: Record<string, number>;
}

export interface CandidateData {
    id: string;
    cluster: {
        frequency: number;
        intensityScore: number;
        demandSignalCount: number;
        signals: Array<{ publishedAt: Date | null; intensityScore: number | null }>;
    } | null;
    competitorMap: unknown;
    featureGaps: unknown;
    deadCompetitors: unknown;
    communitySize: unknown;
    jobPostingVolume: number | null;
    fundingSignals: unknown;
    trendDirection: string | null;
    whyNow: string | null;
}


export type ProgressEventType =
    | "PHASE_START" | "PHASE_COMPLETE" | "PHASE_FAILED"
    | "SCRAPE_SOURCE_DONE" | "ITERATION_START" | "ITERATION_COMPLETE"
    | "SIGNAL_COUNT_UPDATE" | "DONE" | "FATAL";

export interface ProgressEvent {
    type: ProgressEventType;
    jobId: string;
    phase?: PhaseType;
    iterationsDone?: number;
    signalCount?: number;
    message?: string;
    timestamp: number;
    error?: string;
}


export const ITERATION_THRESHOLD = 0.65;
export const PREPROCESS_BATCH_SIZE = 75;
export const SCRAPER_TIMEOUT_MS = 90_000;
export const AI_CALL_TIMEOUT_MS = 120_000;
export const REPORT_CACHE_TTL_SECONDS = 60 * 60 * 6;
export const AI_CACHE_TTL_SECONDS = 60 * 60 * 24;

export const TIER_SOURCES: Record<AnalysisTier, ScrapingSourceType[]> = {
    LOW: [],
    MID: ["REDDIT", "HACKER_NEWS", "G2", "CAPTERRA", "GITHUB_ISSUES", "STACK_OVERFLOW", "PRODUCT_HUNT", "APP_STORE"],
    HIGH: ["REDDIT", "HACKER_NEWS", "G2", "CAPTERRA", "TRUSTPILOT", "GITHUB_ISSUES", "STACK_OVERFLOW", "DEV_TO", "HASHNODE", "LINKEDIN_JOBS", "PRODUCT_HUNT", "APP_STORE"],
};
