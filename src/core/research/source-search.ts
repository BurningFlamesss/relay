/**
 * Resolves a query-aware crawl target for a research source.
 *
 * Discovery registers sources with their *base* URLs (e.g. `https://dev.to`).
 * Crawling those base URLs returns homepages/latest content that is unrelated to
 * the research question, which then yields zero extractable evidence. Crawling a
 * search *page* is also unreliable because most search UIs are JavaScript-heavy
 * and return no extractable text.
 *
 * This module instead maps a source (by domain) to a **topic-scoped JSON API**
 * (or, where no API exists, a search-results URL). Because most search APIs are
 * keyword-based, the natural-language question is first reduced to its salient
 * keywords ("What are the most common complaints about GitHub Actions?" →
 * "github actions").
 *
 *   - Community/code sources → their public JSON APIs (HN Algolia, Stack
 *     Exchange, GitHub, DEV.to, Reddit RSS, arXiv Atom).
 *   - Academic sources       → Crossref / OpenAlex / Semantic Scholar APIs.
 *   - Everything else        → a topic search URL (best effort).
 *
 * When a domain is unknown, the source's default URL is used unchanged.
 */

export interface SourceCrawlTarget {
    url: string
    sourceType: "WEB" | "RSS" | "API"
    apiParams?: Record<string, string>
}

export interface SourceDescriptor {
    domain: string
    url: string
    sourceType: string | null | undefined
    name?: string | null
}

const QUERY_STOPWORDS = new Set([
    "what", "are", "is", "was", "were", "the", "most", "common", "about",
    "do", "does", "did", "how", "why", "which", "who", "when", "where",
    "users", "user", "people", "developers", "engineers", "customers",
    "report", "reported", "say", "said", "regarding", "concerning",
    "with", "for", "of", "to", "in", "on", "a", "an", "and", "or",
    "best", "practices", "challenges", "limitations", "tutorial", "guide",
    "documentation", "issue", "issues", "problem", "problems", "top", "main",
    "biggest", "new", "list", "their", "they", "them", "this", "that",
    "these", "those", "from", "into", "over", "than", "have", "has", "had",
    // Intent words: better left to the evidence extractor than to keyword search.
    "complaint", "complaints", "complain", "dislike", "dislikes", "frustrating",
    "frustration", "frustrations", "annoying", "pain", "points", "experience",
    "thoughts", "opinions", "feedback", "reviews",
])

function normaliseDomain(domain: string): string {
    return (domain || "").replace(/^www\./, "").toLowerCase()
}

function isRedditDomain(domain: string): boolean {
    return (
        domain.includes("reddit.com") ||
        domain.includes("teddit.net") ||
        domain.includes("libreddit") ||
        domain.includes("reveddit")
    )
}

/** Reduce a natural-language question to salient keywords for search APIs. */
export function keywordQuery(query: string): string {
    const words = (query || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter(Boolean)

    const kept = words.filter((w) => w.length > 1 && !QUERY_STOPWORDS.has(w))
    const chosen = kept.length >= 2 ? kept : words
    return chosen.join(" ").slice(0, 120).trim() || (query || "").trim()
}

/** Pick a plausible single-word tag from a keyword query (for DEV.to tags). */
function firstTag(keyword: string): string | null {
    return keyword.toLowerCase().match(/[a-z][a-z0-9]{2,}/)?.[0] ?? null
}

/** Domain-specific search-results URL for remaining WEB sources. */
function webSearchUrl(domain: string, query: string): string | null {
    const q = encodeURIComponent(query)
    if (domain.includes("medium.com")) return `https://medium.com/search?q=${q}`
    if (domain.includes("producthunt.com")) return `https://www.producthunt.com/search?q=${q}`
    if (domain.includes("g2.com")) return `https://www.g2.com/search?query=${q}`
    if (domain.includes("capterra.com")) return `https://www.capterra.com/search?q=${q}`
    if (domain.includes("lobste.rs")) return `https://lobste.rs/search?q=${q}`
    if (domain.includes("hashnode")) return `https://hashnode.com/search?q=${q}`
    return null
}

export function resolveSourceCrawlTarget(
    source: SourceDescriptor,
    query: string
): SourceCrawlTarget {
    const type = (source.sourceType ?? "WEB") as "WEB" | "RSS" | "API"
    const domain = normaliseDomain(source.domain)
    const trimmed = (query ?? "").trim()

    if (!trimmed) {
        return { url: source.url, sourceType: type }
    }

    // Keyword form is what keyword-based search APIs expect.
    const keyword = keywordQuery(trimmed)

    // --- Community / code sources: prefer reliable JSON APIs ---
    if (isRedditDomain(domain)) {
        // Reddit's JSON API blocks bots (403); the search RSS/Atom feed works.
        return {
            url: `https://www.reddit.com/search.rss?q=${encodeURIComponent(keyword)}&sort=relevance`,
            sourceType: "RSS",
        }
    }
    if (domain.includes("news.ycombinator.com") || domain === "ycombinator.com") {
        return {
            url: "https://hn.algolia.com/api/v1/search",
            sourceType: "API",
            apiParams: { query: keyword, tags: "(story,comment)", hitsPerPage: "25" },
        }
    }
    if (domain.includes("stackoverflow.com") || domain.includes("stackexchange.com")) {
        return {
            url: "https://api.stackexchange.com/2.3/search/advanced",
            sourceType: "API",
            apiParams: {
                order: "desc",
                sort: "relevance",
                q: keyword,
                site: "stackoverflow",
                pagesize: "25",
                filter: "withbody",
            },
        }
    }
    if (domain.includes("github.com")) {
        return {
            url: "https://api.github.com/search/issues",
            sourceType: "API",
            apiParams: { q: keyword, per_page: "25", sort: "relevance" },
        }
    }
    if (domain.includes("dev.to")) {
        const tag = firstTag(keyword)
        if (tag) {
            return { url: `https://dev.to/feed/tag/${tag}`, sourceType: "RSS" }
        }
        return { url: `https://dev.to/search?q=${encodeURIComponent(keyword)}`, sourceType: "WEB" }
    }

    // --- Academic sources ---
    if (domain.includes("arxiv.org")) {
        // arXiv exposes an Atom feed (not JSON).
        return {
            url: `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(keyword)}&max_results=25`,
            sourceType: "RSS",
        }
    }
    if (domain.includes("openalex.org")) {
        return {
            url: "https://api.openalex.org/works",
            sourceType: "API",
            apiParams: { search: keyword, "per-page": "25" },
        }
    }
    if (domain.includes("crossref.org")) {
        return {
            url: "https://api.crossref.org/works",
            sourceType: "API",
            apiParams: { query: keyword, rows: "25" },
        }
    }
    if (domain.includes("semanticscholar.org")) {
        return {
            url: "https://api.semanticscholar.org/graph/v1/paper/search",
            sourceType: "API",
            apiParams: {
                query: keyword,
                limit: "25",
                fields: "title,abstract,url,year,authors,citationCount,venue",
            },
        }
    }

    // --- Remaining sources: best-effort topic search URL ---
    const web = webSearchUrl(domain, keyword)
    if (web) return { url: web, sourceType: type === "RSS" ? "WEB" : type }

    return { url: source.url, sourceType: type }
}
