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
            url,
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