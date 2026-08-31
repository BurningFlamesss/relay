import { prisma } from "#/db.ts"
import type { ResearchSource, SourceCategory, CrawlPolicy, SourceDiscoveryResult } from "./types.ts"
import { createHash } from "node:crypto"

const SOURCE_CACHE_TTL = 1000 * 60 * 60 * 24
let sourceCache: ResearchSource[] | null = null
let cacheTimestamp = 0

export async function getSourceRegistry(): Promise<ResearchSource[]> {
    const now = Date.now()
    if (sourceCache && now - cacheTimestamp < SOURCE_CACHE_TTL) {
        return sourceCache
    }

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

    sourceCache = sources.map(mapPrismaSource)
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

export function generateContentHash(content: string): string {
    return createHash("sha256").update(content).digest("hex").slice(0, 32)
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