import { prisma } from "#/db.ts"
import type { ResearchSource, SourceCategory, CrawlPolicy, SourceDiscoveryResult } from "./types.ts"
import { createHash } from "node:crypto"

const SOURCE_CACHE_TTL = 1000 * 60 * 60 * 24
let sourceCache: ResearchSource[] | null = null
let cacheTimestamp = 0

// Hardcoded global sources as fallback
const GLOBAL_SOURCES: ResearchSource[] = [
    {
        id: "src-github",
        jobId: "seed-global",
        name: "GitHub",
        domain: "github.com",
        url: "https://github.com",
        category: "TECHNICAL",
        priority: 10,
        sourceType: "WEB",
        enabled: true,
        crawlPolicy: { maxDepth: 2, maxPages: 100 },
        crawlStatus: "PENDING",
        relevanceScore: undefined,
        authorityScore: undefined,
        freshnessScore: undefined,
    },
    {
        id: "src-reddit",
        jobId: "seed-global",
        name: "Reddit",
        domain: "reddit.com",
        url: "https://reddit.com",
        category: "COMMUNITY",
        priority: 9,
        sourceType: "WEB",
        enabled: true,
        crawlPolicy: { maxDepth: 2, maxPages: 100 },
        crawlStatus: "PENDING",
        relevanceScore: undefined,
        authorityScore: undefined,
        freshnessScore: undefined,
    },
    {
        id: "src-stackoverflow",
        jobId: "seed-global",
        name: "Stack Overflow",
        domain: "stackoverflow.com",
        url: "https://stackoverflow.com",
        category: "TECHNICAL",
        priority: 9,
        sourceType: "WEB",
        enabled: true,
        crawlPolicy: { maxDepth: 2, maxPages: 100 },
        crawlStatus: "PENDING",
        relevanceScore: undefined,
        authorityScore: undefined,
        freshnessScore: undefined,
    },
    {
        id: "src-hackernews",
        jobId: "seed-global",
        name: "Hacker News",
        domain: "news.ycombinator.com",
        url: "https://news.ycombinator.com",
        category: "COMMUNITY",
        priority: 8,
        sourceType: "WEB",
        enabled: true,
        crawlPolicy: { maxDepth: 1, maxPages: 50 },
        crawlStatus: "PENDING",
        relevanceScore: undefined,
        authorityScore: undefined,
        freshnessScore: undefined,
    },
    {
        id: "src-devto",
        jobId: "seed-global",
        name: "DEV Community",
        domain: "dev.to",
        url: "https://dev.to",
        category: "TECHNICAL",
        priority: 7,
        sourceType: "WEB",
        enabled: true,
        crawlPolicy: { maxDepth: 2, maxPages: 100 },
        crawlStatus: "PENDING",
        relevanceScore: undefined,
        authorityScore: undefined,
        freshnessScore: undefined,
    },
    {
        id: "src-medium",
        jobId: "seed-global",
        name: "Medium",
        domain: "medium.com",
        url: "https://medium.com",
        category: "COMMUNITY",
        priority: 6,
        sourceType: "WEB",
        enabled: true,
        crawlPolicy: { maxDepth: 2, maxPages: 100 },
        crawlStatus: "PENDING",
        relevanceScore: undefined,
        authorityScore: undefined,
        freshnessScore: undefined,
    },

    // Lightweight frontends (no anti-bot)
    {
        id: "src-old-reddit",
        jobId: "seed-global",
        name: "Old Reddit",
        domain: "old.reddit.com",
        url: "https://old.reddit.com",
        category: "COMMUNITY",
        priority: 9,
        sourceType: "WEB",
        enabled: true,
        crawlPolicy: { maxDepth: 2, maxPages: 50 },
        crawlStatus: "PENDING",
        relevanceScore: undefined,
        authorityScore: undefined,
        freshnessScore: undefined,
    },
    {
        id: "src-teddit",
        jobId: "seed-global",
        name: "Teddit (Reddit Frontend)",
        domain: "teddit.net",
        url: "https://teddit.net",
        category: "COMMUNITY",
        priority: 9,
        sourceType: "WEB",
        enabled: true,
        crawlPolicy: { maxDepth: 2, maxPages: 50 },
        crawlStatus: "PENDING",
        relevanceScore: undefined,
        authorityScore: undefined,
        freshnessScore: undefined,
    },
    {
        id: "src-hackernews-rss",
        jobId: "seed-global",
        name: "Hacker News RSS",
        domain: "news.ycombinator.com",
        url: "https://news.ycombinator.com/rss",
        category: "TECHNICAL",
        priority: 10,
        sourceType: "RSS",
        enabled: true,
        crawlPolicy: { maxDepth: 1, maxPages: 30 },
        crawlStatus: "PENDING",
        relevanceScore: undefined,
        authorityScore: undefined,
        freshnessScore: undefined,
    },
    {
        id: "src-lobsters",
        jobId: "seed-global",
        name: "Lobste.rs",
        domain: "lobste.rs",
        url: "https://lobste.rs/rss",
        category: "TECHNICAL",
        priority: 8,
        sourceType: "RSS",
        enabled: true,
        crawlPolicy: { maxDepth: 1, maxPages: 25 },
        crawlStatus: "PENDING",
        relevanceScore: undefined,
        authorityScore: undefined,
        freshnessScore: undefined,
    },
    {
        id: "src-devto-rss",
        jobId: "seed-global",
        name: "DEV Community RSS",
        domain: "dev.to",
        url: "https://dev.to/feed",
        category: "TECHNICAL",
        priority: 7,
        sourceType: "RSS",
        enabled: true,
        crawlPolicy: { maxDepth: 1, maxPages: 30 },
        crawlStatus: "PENDING",
        relevanceScore: undefined,
        authorityScore: undefined,
        freshnessScore: undefined,
    },

    // API sources (for enrichment phase)
    {
        id: "src-arxiv",
        jobId: "seed-global",
        name: "ArXiv",
        domain: "arxiv.org",
        url: "https://export.arxiv.org/api/query",
        category: "ACADEMIC",
        priority: 10,
        sourceType: "API",
        enabled: true,
        crawlPolicy: { maxDepth: 1, maxPages: 50 },
        crawlStatus: "PENDING",
        relevanceScore: undefined,
        authorityScore: undefined,
        freshnessScore: undefined,
    },
    {
        id: "src-crossref",
        jobId: "seed-global",
        name: "Crossref",
        domain: "crossref.org",
        url: "https://api.crossref.org",
        category: "ACADEMIC",
        priority: 9,
        sourceType: "API",
        enabled: true,
        crawlPolicy: { maxDepth: 1, maxPages: 50 },
        crawlStatus: "PENDING",
        relevanceScore: undefined,
        authorityScore: undefined,
        freshnessScore: undefined,
    },
    {
        id: "src-openalex",
        jobId: "seed-global",
        name: "OpenAlex",
        domain: "openalex.org",
        url: "https://api.openalex.org",
        category: "ACADEMIC",
        priority: 9,
        sourceType: "API",
        enabled: true,
        crawlPolicy: { maxDepth: 1, maxPages: 50 },
        crawlStatus: "PENDING",
        relevanceScore: undefined,
        authorityScore: undefined,
        freshnessScore: undefined,
    },
    {
        id: "src-semantic-scholar",
        jobId: "seed-global",
        name: "Semantic Scholar",
        domain: "semanticscholar.org",
        url: "https://api.semanticscholar.org",
        category: "ACADEMIC",
        priority: 8,
        sourceType: "API",
        enabled: true,
        crawlPolicy: { maxDepth: 1, maxPages: 50 },
        crawlStatus: "PENDING",
        relevanceScore: undefined,
        authorityScore: undefined,
        freshnessScore: undefined,
    },
    {
        id: "src-crossref-dois",
        jobId: "seed-global",
        name: "Crossref DOIs",
        domain: "crossref.org",
        url: "https://api.crossref.org/works",
        category: "ACADEMIC",
        priority: 8,
        sourceType: "API",
        enabled: true,
        crawlPolicy: { maxDepth: 1, maxPages: 50 },
        crawlStatus: "PENDING",
        relevanceScore: undefined,
        authorityScore: undefined,
        freshnessScore: undefined,
    },
]

export async function getSourceRegistry(): Promise<ResearchSource[]> {
    const now = Date.now()
    if (sourceCache && now - cacheTimestamp < SOURCE_CACHE_TTL) {
        console.log(`[SOURCE_REGISTRY] Returning cached sources (${sourceCache.length} sources)`)
        return sourceCache
    }

    console.log(`[SOURCE_REGISTRY] Querying database for seed-global sources...`)
    const sources = await prisma.researchSource.findMany({
        where: {
            enabled: true,
            jobId: "seed-global",
        },
        orderBy: [
            { priority: "desc" },
            { category: "asc" },
        ],
    })

    console.log(`[SOURCE_REGISTRY] Found ${sources.length} sources in database`)

    let finalSources = sources.map(mapPrismaSource)
    
    // Fallback to hardcoded global sources if database is empty
    if (finalSources.length === 0) {
        console.log(`[SOURCE_REGISTRY] Database empty, using hardcoded global sources (${GLOBAL_SOURCES.length} sources)`)
        finalSources = GLOBAL_SOURCES
    }

    sourceCache = finalSources
    cacheTimestamp = now
    return sourceCache
}
export function invalidateSourceCache(): void {
    sourceCache = null
    cacheTimestamp = 0
}

export async function getSourcesByCategory(category: SourceCategory): Promise<ResearchSource[]> {
    const sources = await getSourceRegistry()
    return sources.filter(s => s.category === category)
}

export async function getSourcesByDomain(domain: string): Promise<ResearchSource[]> {
    const sources = await getSourceRegistry()
    return sources.filter(s => s.domain === domain)
}

export async function getSourceById(id: string): Promise<ResearchSource | null> {
    const sources = await getSourceRegistry()
    return sources.find(s => s.id === id) ?? null
}

export async function searchSources(
    query: string,
    options: {
        categories?: SourceCategory[]
        maxResults?: number
        minPriority?: number
    } = {}
): Promise<ResearchSource[]> {
    const { categories, maxResults = 20, minPriority = 1 } = options

    let sources = await getSourceRegistry()

    if (categories && categories.length > 0) {
        sources = sources.filter(s => categories.includes(s.category))
    }

    sources = sources.filter(s => s.priority >= minPriority)

    const scored = sources.map(source => ({
        source,
        score: calculateRelevanceScore(source, query),
    }))

    scored.sort((a, b) => b.score - a.score)

    return scored.slice(0, maxResults).map(s => s.source)
}

function calculateRelevanceScore(source: ResearchSource, query: string): number {
    const queryLower = query.toLowerCase()
    const domainLower = source.domain.toLowerCase()
    const nameLower = source.name.toLowerCase()

    let score = source.priority

    if (domainLower.includes(queryLower)) score += 20
    if (nameLower.includes(queryLower)) score += 15

    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2)
    for (const word of queryWords) {
        if (domainLower.includes(word)) score += 5
        if (nameLower.includes(word)) score += 3
    }

    return score
}

export async function discoverSources(
    plan: { searchQueries: Array<{ query: string; expectedSourceTypes: SourceCategory[] }> },
    options: { maxSources?: number; minAuthorityScore?: number } = {}
): Promise<SourceDiscoveryResult> {
    const { maxSources = 30, minAuthorityScore = 0 } = options

    const allCandidates: Array<{ source: ResearchSource; score: number; matchedQuery: string }> = []

    for (const searchQuery of plan.searchQueries) {
        const sources = await searchSources(searchQuery.query, {
            categories: searchQuery.expectedSourceTypes,
            maxResults: 50,
        })

        for (const source of sources) {
            const score = calculateRelevanceScore(source, searchQuery.query)
            allCandidates.push({ source, score, matchedQuery: searchQuery.query })
        }
    }

    const uniqueSources = new Map<string, { source: ResearchSource; score: number; queries: string[] }>()

    for (const candidate of allCandidates) {
        const existing = uniqueSources.get(candidate.source.id)
        if (!existing || candidate.score > existing.score) {
            uniqueSources.set(candidate.source.id, {
                source: candidate.source,
                score: candidate.score,
                queries: existing ? [...existing.queries, candidate.matchedQuery] : [candidate.matchedQuery],
            })
        }
    }

    let filtered = Array.from(uniqueSources.values())
        .filter(item => item.source.authorityScore === undefined || item.source.authorityScore >= minAuthorityScore)
        .sort((a, b) => b.score - a.score)

    const totalCandidates = filtered.length
    const duplicateCount = allCandidates.length - uniqueSources.size

    filtered = filtered.slice(0, maxSources)

    return {
        sources: filtered.map(f => f.source),
        totalCandidates,
        filteredCount: filtered.length,
        duplicateCount,
    }
}

export function mapPrismaSource(source: {
    id: string
    name: string
    domain: string
    url: string
    category: SourceCategory
    priority: number
    sourceType: SourceType
    enabled: boolean
    crawlPolicy: Record<string, unknown> | null
    relevanceScore: number | null
    authorityScore: number | null
    freshnessScore: number | null
}): ResearchSource {
    return {
        id: source.id,
        name: source.name,
        domain: source.domain,
        url: source.url,
        category: source.category,
        priority: source.priority,
        sourceType: source.sourceType,
        enabled: source.enabled,
        crawlPolicy: source.crawlPolicy as CrawlPolicy | undefined,
        relevanceScore: source.relevanceScore ?? undefined,
        authorityScore: source.authorityScore ?? undefined,
        freshnessScore: source.freshnessScore ?? undefined,
    }
}

export function generateContentHash(content: string, url?: string): string {
    return createHash("sha256").update(content + (url ?? "")).digest("hex").slice(0, 32)
}

export function generateUrlHash(url: string): string {
    try {
        const normalized = new URL(url).href
        return createHash("sha256").update(normalized).digest("hex").slice(0, 32)
    } catch {
        return createHash("sha256").update(url).digest("hex").slice(0, 32)
    }
}

export function extractDomain(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "")
    } catch {
        return url
    }
}

export function normalizeUrl(url: string): string {
    try {
        const u = new URL(url)
        u.hash = ""
        u.search = ""
        return u.href
    } catch {
        return url
    }
}

export function isSameContent(hash1: string, hash2: string): boolean {
    return hash1 === hash2
}