import { serverEnv } from "#/env/server.ts"

export interface CrawlOptions {
    maxDepth?: number
    maxPages?: number
    allowedDomains?: string[]
    blockedDomains?: string[]
    timeoutMs?: number
    concurrency?: number
    extractMedia?: boolean
    extractLinks?: boolean
    waitFor?: string
    jsCode?: string
    screenshot?: boolean
    pdf?: boolean
    sourceType?: "WEB" | "RSS" | "API"
    apiParams?: Record<string, string>
    rssSelector?: string
}

export interface CrawlResult {
    url: string
    success: boolean
    statusCode?: number
    title?: string
    description?: string
    markdown?: string
    html?: string
    text?: string
    headings?: Array<{ level: number; text: string }>
    links?: Array<{ url: string; text: string; internal: boolean }>
    media?: Array<{ url: string; type: string; alt?: string }>
    metadata?: Record<string, unknown>
    publishedAt?: string
    author?: string
    language?: string
    wordCount?: number
    error?: string
    crawledAt: Date
}

export interface DeepCrawlOptions extends CrawlOptions {
    maxDepth: number
    maxPages: number
    strategy?: "bfs" | "dfs"
    filter?: string
}

export class Crawl4AIError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly statusCode?: number,
        public readonly retryable: boolean = false,
        public readonly url?: string
    ) {
        super(message)
        this.name = "Crawl4AIError"
    }
}

export class CrawlerService {
    private readonly baseUrl: string
    private readonly apiToken: string
    private readonly defaultTimeout: number

    constructor() {
        this.baseUrl = serverEnv.CRAWL4AI_URL.replace(/\/$/, "")
        this.apiToken = serverEnv.CRAWL4AI_API_TOKEN ?? ""
        this.defaultTimeout = serverEnv.RESEARCH_CRAWL_TIMEOUT_MS
    }

    private getHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        }
        if (this.apiToken) {
            headers["Authorization"] = `Bearer ${this.apiToken}`
        }
        return headers
    }

    async crawlUrl(url: string, options: CrawlOptions = {}): Promise<CrawlResult> {
        const payload = this.buildCrawlPayload(url, options)
        const response = await this.fetchWithRetry(payload)
        const data = await response.json()
        return this.normalizeResult(data, url)
    }

    async crawlUrls(urls: string[], options: CrawlOptions = {}): Promise<CrawlResult[]> {
        const results: CrawlResult[] = []
        const concurrency = options.concurrency ?? 3

        for (let i = 0; i < urls.length; i += concurrency) {
            const batch = urls.slice(i, i + concurrency)
            const batchResults = await Promise.allSettled(
                batch.map(url => this.crawlUrl(url, options))
            )

            for (const result of batchResults) {
                if (result.status === "fulfilled") {
                    results.push(result.value)
                } else {
                    console.error(`[CRAWLER] Failed to crawl: ${result.reason}`)
                    results.push({
                        url: batch[results.length] ?? "",
                        success: false,
                        error: result.reason?.message ?? "Unknown error",
                        crawledAt: new Date(),
                    })
                }
            }
        }

        return results
    }

    async crawlRss(url: string, options: CrawlOptions = {}): Promise<CrawlResult[]> {
        console.log(`[CRAWLER] Fetching RSS feed: ${url}`)
        
        try {
            const response = await fetch(url, {
                headers: {
                    "User-Agent": "Relay Research Bot/1.0",
                    "Accept": "application/rss+xml, application/xml, text/xml"
                },
                signal: AbortSignal.timeout(options.timeoutMs ?? 30000)
            })

            if (!response.ok) {
                throw new Error(`RSS fetch failed: ${response.status}`)
            }

            const xmlText = await response.text()
            const items = this.parseRssFeed(xmlText, url)
            
            return items.map(item => ({
                url: item.link,
                success: true,
                title: item.title,
                description: item.description,
                text: item.content ?? item.description ?? "",
                markdown: undefined,
                html: undefined,
                headings: [],
                links: [],
                media: [],
                metadata: {
                    sourceType: "RSS",
                    pubDate: item.pubDate,
                    guid: item.guid,
                    categories: item.categories
                },
                publishedAt: item.pubDate,
                author: item.author,
                language: undefined,
                wordCount: item.content?.length ?? item.description?.length ?? 0,
                crawledAt: new Date(),
            }))
        } catch (error) {
            console.error(`[CRAWLER] RSS fetch failed for ${url}:`, error)
            return [{
                url,
                success: false,
                error: error instanceof Error ? error.message : "RSS fetch failed",
                crawledAt: new Date(),
            }]
        }
    }

    private parseRssFeed(xmlText: string, sourceUrl: string): Array<{
        title: string
        link: string
        description: string
        content: string
        pubDate: string
        author: string
        guid: string
        categories: string[]
    }> {
        const items: Array<{
            title: string
            link: string
            description: string
            content: string
            pubDate: string
            author: string
            guid: string
            categories: string[]
        }> = []

        try {
            // Simple regex-based RSS parsing (for Atom/RSS 2.0)
            const itemRegex = /<item>([\s\S]*?)<\/item>/g
            let match

            while ((match = itemRegex.exec(xmlText)) !== null) {
                const itemXml = match[1]
                
                const getTag = (tag: string) => {
                    const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i')
                    const m = itemXml.match(regex)
                    return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : ""
                }

                const title = getTag("title")
                const link = getTag("link")
                const description = getTag("description")
                const content = getTag("content:encoded") || getTag("content") || description
                const pubDate = getTag("pubDate") || getTag("dc:date") || getTag("published")
                const author = getTag("author") || getTag("dc:creator")
                const guid = getTag("guid")
                const categories = [...itemXml.matchAll(/<category[^>]*>([^<]+)<\/category>/gi)].map(m => m[1])

                if (title && link) {
                    items.push({ title, link, description, content, pubDate, author, guid, categories })
                }
            }

            // Also try Atom format
            if (items.length === 0) {
                const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
                while ((match = entryRegex.exec(xmlText)) !== null) {
                    const entryXml = match[1]
                    
                    const getTag = (tag: string) => {
                        const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i')
                        const m = entryXml.match(regex)
                        return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : ""
                    }

                    const title = getTag("title")
                    const linkMatch = entryXml.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i)
                    const link = linkMatch ? linkMatch[1] : ""
                    const description = getTag("summary") || getTag("content")
                    const content = getTag("content") || description
                    const pubDate = getTag("updated") || getTag("published")
                    const authorMatch = entryXml.match(/<author>([\s\S]*?)<name>([^<]+)<\/name>[\s\S]*?<\/author>/i)
                    const author = authorMatch ? authorMatch[2] : ""
                    const guid = getTag("id")

                    if (title && link) {
                        items.push({ title, link, description, content, pubDate, author, guid, categories: [] })
                    }
                }
            }
        } catch (error) {
            console.error(`[CRAWLER] RSS parse error:`, error)
        }

        return items
    }

    async crawlApi(url: string, options: CrawlOptions = {}): Promise<CrawlResult[]> {
        console.log(`[CRAWLER] Fetching API: ${url}`)
        
        const params = new URLSearchParams(options.apiParams ?? {})
        const fullUrl = `${url}?${params.toString()}`

        try {
            const response = await fetch(fullUrl, {
                headers: {
                    "User-Agent": "Relay Research Bot/1.0",
                    "Accept": "application/json"
                },
                signal: AbortSignal.timeout(options.timeoutMs ?? 30000)
            })

            if (!response.ok) {
                throw new Error(`API fetch failed: ${response.status}`)
            }

            const data = await response.json()
            const items = this.parseApiResponse(data, url)
            
            return items.map(item => ({
                url: item.url,
                success: true,
                title: item.title,
                description: item.description,
                text: item.text,
                markdown: undefined,
                html: undefined,
                headings: [],
                links: [],
                media: [],
                metadata: {
                    sourceType: "API",
                    ...item.metadata
                },
                publishedAt: item.publishedAt,
                author: item.author,
                language: undefined,
                wordCount: item.text?.length ?? 0,
                crawledAt: new Date(),
            }))
        } catch (error) {
            console.error(`[CRAWLER] API fetch failed for ${url}:`, error)
            return [{
                url,
                success: false,
                error: error instanceof Error ? error.message : "API fetch failed",
                crawledAt: new Date(),
            }]
        }
    }

    private parseApiResponse(data: unknown, sourceUrl: string): Array<{
        title: string
        url: string
        description: string
        text: string
        publishedAt: string
        author: string
        metadata: Record<string, unknown>
    }> {
        const items: Array<{
            title: string
            url: string
            description: string
            text: string
            publishedAt: string
            author: string
            metadata: Record<string, unknown>
        }> = []

        try {
            // Handle ArXiv API (Atom format)
            if (sourceUrl.includes("arxiv.org")) {
                // ArXiv returns Atom XML, but we'd parse it here
                // For now, return empty - the RSS handler can handle Atom
            }
            // Handle Crossref API
            else if (sourceUrl.includes("crossref.org")) {
                const works = (data as { items?: unknown[] })?.items ?? []
                for (const work of works.slice(0, 50)) {
                    const w = work as Record<string, unknown>
                    items.push({
                        title: (w.title as string[])?.join(" ") ?? "",
                        url: w.DOI ? `https://doi.org/${w.DOI}` : (w.URL as string) ?? "",
                        description: (w.abstract as string) ?? (w["container-title"] as string[])?.join(" ") ?? "",
                        text: (w.abstract as string) ?? "",
                        publishedAt: w["published-print"]?.["date-parts"]?.[0]?.join("-") ?? w.created?.["date-parts"]?.[0]?.join("-") ?? "",
                        author: (w.author as Array<{ given: string; family: string }>)?.map(a => `${a.given} ${a.family}`).join(", ") ?? "",
                        metadata: { doi: w.DOI, type: w.type, journal: w["container-title"] }
                    })
                }
            }
            // Handle OpenAlex API
            else if (sourceUrl.includes("openalex.org")) {
                const works = (data as { results?: unknown[] })?.results ?? []
                for (const work of works.slice(0, 50)) {
                    const w = work as Record<string, unknown>
                    items.push({
                        title: w.title as string ?? "",
                        url: w.id as string ?? "",
                        description: w.abstract as string ?? "",
                        text: w.abstract as string ?? "",
                        publishedAt: w.publication_year ? `${w.publication_year}-01-01` : "",
                        author: (w.authorships as Array<{ author: { display_name: string } }>)?.map(a => a.author.display_name).join(", ") ?? "",
                        metadata: { doi: w.doi, cited_by_count: w.cited_by_count, type: w.type }
                    })
                }
            }
            // Handle Semantic Scholar API
            else if (sourceUrl.includes("semanticscholar.org")) {
                const papers = (data as { data?: unknown[] })?.data ?? (data as { papers?: unknown[] })?.papers ?? []
                for (const paper of papers.slice(0, 50)) {
                    const p = paper as Record<string, unknown>
                    items.push({
                        title: p.title as string ?? "",
                        url: p.url as string ?? `https://www.semanticscholar.org/paper/${p.paperId}`,
                        description: p.abstract as string ?? "",
                        text: p.abstract as string ?? "",
                        publishedAt: p.year ? `${p.year}-01-01` : "",
                        author: (p.authors as Array<{ name: string }>)?.map(a => a.name).join(", ") ?? "",
                        metadata: { paperId: p.paperId, citationCount: p.citationCount, venue: p.venue }
                    })
                }
            }
        } catch (error) {
            console.error(`[CRAWLER] API parse error:`, error)
        }

        return items
    }

    async crawlSourceByType(url: string, sourceType: "WEB" | "RSS" | "API", options: CrawlOptions = {}): Promise<CrawlResult[]> {
        switch (sourceType) {
            case "RSS":
                return this.crawlRss(url, options)
            case "API":
                return this.crawlApi(url, options)
            case "WEB":
            default:
                if (Array.isArray(options.apiParams)) {
                    return this.crawlUrls([url], options)
                }
                return [await this.crawlUrl(url, options)]
        }
    }

    async crawlSite(url: string, options: DeepCrawlOptions): Promise<CrawlResult[]> {
        const payload = {
            ...this.buildCrawlPayload(url, options),
            crawl: {
                max_depth: options.maxDepth,
                max_pages: options.maxPages,
                strategy: options.strategy ?? "bfs",
                filter: options.filter,
            },
        }

        const response = await this.fetchWithRetry(payload, "crawl")
        const data = await response.json()

        if (!Array.isArray(data.results)) {
            throw new Crawl4AIError(
                "Invalid crawl response format",
                "INVALID_RESPONSE",
                undefined,
                false,
                url
            )
        }

        return data.results.map((result: Record<string, unknown>) =>
            this.normalizeResult(result, result.url as string)
        )
    }

    async checkHealth(): Promise<{ healthy: boolean; version?: string; error?: string }> {
        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 5000)

            const response = await fetch(`${this.baseUrl}/health`, {
                method: "GET",
                headers: this.getHeaders(),
                signal: controller.signal,
            })

            clearTimeout(timeoutId)

            if (response.ok) {
                const data = await response.json()
                return { healthy: true, version: data.version }
            }

            return { healthy: false, error: `Health check failed: ${response.status}` }
        } catch (error) {
            return { healthy: false, error: error instanceof Error ? error.message : "Unknown error" }
        }
    }

    private buildCrawlPayload(url: string, options: CrawlOptions): Record<string, unknown> {
        return {
            urls: [url],
            config: {
                timeout: options.timeoutMs ?? this.defaultTimeout,
                wait_for: options.waitFor,
                js_code: options.jsCode,
                screenshot: options.screenshot ?? false,
                pdf: options.pdf ?? false,
                extract_media: options.extractMedia ?? false,
                extract_links: options.extractLinks ?? true,
                word_count_threshold: 10,
                remove_overlay_elements: true,
                remove_forms: true,
                remove_scripts: true,
                remove_styles: true,
                excluded_tags: ["nav", "footer", "aside", "header", "script", "style", "noscript", "iframe"],
                excluded_classes: [
                    "cookie", "banner", "popup", "modal", "overlay", "advertisement",
                    "ads", "sidebar", "navigation", "menu", "header", "footer",
                    "comment", "share", "social", "newsletter", "subscribe"
                ],
                excluded_ids: [
                    "cookie", "banner", "popup", "modal", "overlay",
                    "advertisement", "ads", "sidebar", "navigation"
                ],
            },
        }
    }

    private async fetchWithRetry(payload: Record<string, unknown>, endpoint = "crawl", attempt = 1): Promise<Response> {
        const maxAttempts = 3
        const baseDelay = 2000

        for (let i = attempt; i <= maxAttempts; i++) {
            try {
                const controller = new AbortController()
                const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeout)

                const response = await fetch(`${this.baseUrl}/${endpoint}`, {
                    method: "POST",
                    headers: this.getHeaders(),
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                })

                clearTimeout(timeoutId)

                if (response.status === 429) {
                    const retryAfter = response.headers.get("Retry-After")
                    const delay = retryAfter ? parseInt(retryAfter) * 1000 : baseDelay * Math.pow(2, i - 1)
                    console.warn(`[CRAWLER] Rate limited, waiting ${delay}ms before retry ${i}/${maxAttempts}`)
                    await this.sleep(delay)
                    continue
                }

                if (response.status >= 500) {
                    if (i < maxAttempts) {
                        const delay = baseDelay * Math.pow(2, i - 1)
                        console.warn(`[CRAWLER] Server error ${response.status}, retry ${i}/${maxAttempts} in ${delay}ms`)
                        await this.sleep(delay)
                        continue
                    }
                }

                if (!response.ok) {
                    const errorText = await response.text()
                    throw new Crawl4AIError(
                        `Crawl4AI error: ${response.status} - ${errorText}`,
                        "API_ERROR",
                        response.status,
                        response.status >= 500 || response.status === 429,
                        payload.url as string
                    )
                }

                return response
            } catch (error) {
                if (error instanceof Crawl4AIError) throw error

                if (error instanceof DOMException && error.name === "AbortError") {
                    throw new Crawl4AIError(
                        "Crawl timeout",
                        "TIMEOUT",
                        408,
                        true,
                        payload.url as string
                    )
                }

                if (i < maxAttempts) {
                    const delay = baseDelay * Math.pow(2, i - 1)
                    console.warn(`[CRAWLER] Network error, retry ${i}/${maxAttempts} in ${delay}ms: ${error}`)
                    await this.sleep(delay)
                    continue
                }

                throw new Crawl4AIError(
                    `Network error: ${error}`,
                    "NETWORK_ERROR",
                    undefined,
                    true,
                    payload.url as string
                )
            }
        }

        throw new Crawl4AIError(
            "Max retries exceeded",
            "MAX_RETRIES",
            undefined,
            false,
            payload.url as string
        )
    }

    private normalizeResult(data: Record<string, unknown>, originalUrl: string): CrawlResult {
        const success = data.success === true || data.status_code === 200

        const url = data.url as string | undefined
        const statusCode = data.status_code as number | undefined
        const title = data.title as string | undefined
        const description = data.description as string | undefined
        const markdown = data.markdown as string | undefined
        const html = data.html as string | undefined
        const text = data.text as string | undefined
        const headings = data.headings as Array<{ level: number; text: string }> | undefined
        const links = data.links as Array<{ url: string; text: string; internal: boolean }> | undefined
        const media = data.media as Array<{ url: string; type: string; alt?: string }> | undefined
        const metadata = data.metadata as Record<string, unknown> | undefined
        const publishedAt = data.published_at as string | undefined
        const author = data.author as string | undefined
        const language = data.language as string | undefined
        const wordCount = data.word_count as number | undefined
        const errorMessage = data.error_message as string | undefined

        return {
            url: url ?? originalUrl,
            success,
            statusCode,
            title,
            description,
            markdown,
            html,
            text,
            headings: headings ?? [],
            links: links ?? [],
            media: media ?? [],
            metadata: metadata ?? {},
            publishedAt,
            author,
            language,
            wordCount,
            error: success ? undefined : (errorMessage ?? "Unknown crawl error"),
            crawledAt: new Date(),
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
}

export function createCrawlerService(): CrawlerService {
    return new CrawlerService()
}