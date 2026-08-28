export const QUEUE = {
    ORCHESTRATOR: "analysis:orchestrator",
    SCRAPER: "analysis:scraper",
    PREPROCESS: "analysis:preprocess",
    AI: "analysis:ai",
    SCORING: "analysis:scoring",
    DLQ: "analysis:dead-letter",
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
    "DELIVERY"
]

export type PhaseType = (typeof PHASE_ORDER)[number]