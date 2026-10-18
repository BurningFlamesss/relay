import type { ScrapingSourceType, SourceAdapter, ScrapeOptions, RawSignal } from "#/core/types.ts";
import { readdirSync } from "node:fs";
import { extname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCrawlerService } from "#/core/crawler/service.ts";
import { publishProgress } from "#/core/redis.ts";

const registry = new Map<ScrapingSourceType, SourceAdapter>()

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, "..")

const crawler = createCrawlerService()

function createGenericAdapter(source: ScrapingSourceType): SourceAdapter {
    return {
        source,
        rateLimit: 10,
        async scrape(queries: Array<{ query: string; intentLabel: string }>, options: ScrapeOptions): Promise<RawSignal[]> {
            const signals: RawSignal[] = []
            const maxPerQuery = Math.ceil(options.maxSignals / queries.length)

            for (const { query, intentLabel } of queries) {
                try {
                    // Publish progress for each query
                    await publishProgress({
                        type: "CRAWL_URL_START",
                        jobId: options.jobId,
                        source,
                        message: `Crawling "${query}" (${intentLabel})`,
                        timestamp: Date.now(),
                        metadata: { query, intentLabel }
                    })

                    console.log(`[SCRAPER:${source}] Crawling query: "${query}" (${intentLabel})`)
                    
                    const startTime = Date.now()
                    const results = await crawler.searchAndCrawl(query, {
                        maxResults: Math.min(maxPerQuery + 5, 50),
                        timeoutMs: 60000,
                        extractLinks: true,
                        extractMedia: false,
                    })
                    const duration = Date.now() - startTime

                    let added = 0
                    const crawledUrls: string[] = []
                    
                    for (const result of results) {
                        if (result.success && result.text && result.text.length >= 100) {
                            const urlHash = await hashUrl(result.url)
                            
                            // Extract better quote from markdown or text
                            const quote = extractQualityQuote(result.text, result.markdown)

                            signals.push({
                                url: result.url,
                                urlHash,
                                title: result.title,
                                quote,
                                authorHandle: extractAuthor(result.metadata),
                                publishedAt: result.publishedAt,
                            })
                            
                            crawledUrls.push(result.url)
                            added++
                            if (added >= maxPerQuery) break
                        }
                    }
                    
                    // Publish completion with details
                    await publishProgress({
                        type: "CRAWL_URL_DONE",
                        jobId: options.jobId,
                        source,
                        message: `Found ${added} signals from "${query}"`,
                        signalCount: added,
                        duration,
                        timestamp: Date.now(),
                        metadata: { 
                            query, 
                            intentLabel,
                            urls: crawledUrls.slice(0, 5) // First 5 URLs
                        }
                    })
                    
                    console.log(`[SCRAPER:${source}] Found ${added} signals for query "${query}"`)
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error)
                    
                    // Publish failure
                    await publishProgress({
                        type: "CRAWL_URL_FAILED",
                        jobId: options.jobId,
                        source,
                        message: `Failed to crawl "${query}": ${errorMessage}`,
                        error: errorMessage,
                        timestamp: Date.now(),
                        metadata: { query, intentLabel }
                    })
                    
                    console.error(`[SCRAPER:${source}] Crawl failed for query "${query}":`, error)
                    // Continue with other queries instead of failing completely
                }
            }

            console.log(`[SCRAPER:${source}] Total signals: ${signals.length} from ${queries.length} queries`)
            return signals
        },
    }
}

async function hashUrl(url: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(url)
    const hashBuffer = await crypto.subtle.digest("SHA-256", data)
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")
}

function extractQualityQuote(text?: string, markdown?: string): string {
    // Prefer markdown if available as it's usually cleaner
    const content = markdown ?? text ?? ""
    
    // Take first substantial paragraph (up to 500 chars)
    const paragraphs = content.split(/\n\n+/)
    for (const para of paragraphs) {
        const cleaned = para.trim()
        if (cleaned.length >= 50) {
            return cleaned.slice(0, 500)
        }
    }
    
    return content.slice(0, 500)
}

function extractAuthor(metadata?: Record<string, unknown>): string | undefined {
    if (!metadata) return undefined
    
    // Try common author fields
    const author = metadata.author as string | undefined
    if (author) return author
    
    const authorName = metadata.author_name as string | undefined
    if (authorName) return authorName
    
    const byline = metadata.byline as string | undefined
    if (byline) return byline
    
    return undefined
}

async function loadSources() {
    const loadedFromFiles = new Set<ScrapingSourceType>()

    for (const file of readdirSync(__dirname)) {
        const extension = extname(file)
        const name = basename(file, extension)

        if (name === "index") {
            continue
        }

        if (extension !== ".ts" && extension !== ".js") {
            continue
        }

        const mod = await import(resolve(__dirname, file))
        const adapter = (mod.default ?? mod) as Partial<SourceAdapter>

        if (typeof adapter.scrape !== "function") {
            throw new Error()
        }

        if (!adapter.source) {
            throw new Error()
        }

        if (typeof adapter.rateLimit !== "number" || adapter.rateLimit <= 0) {
            throw new Error()
        }

        if (registry.has(adapter.source)) {
            throw new Error()
        }

        registry.set(adapter.source, adapter as SourceAdapter)
        loadedFromFiles.add(adapter.source)
        console.log(`[SOURCE_REGISTRY] Registered: ${adapter.source} (${file})`)
    }

    // Register generic Crawl4AI adapters for all source types not loaded from files
    const allSources: ScrapingSourceType[] = [
        "REDDIT",
        "HACKER_NEWS",
        "CAPTERRA",
        "TRUSTPILOT",
        "GITHUB",
        "GITHUB_ISSUES",
        "STACK_OVERFLOW",
        "DEV_TO",
        "LINKEDIN_JOBS",
        "PRODUCT_HUNT",
        "APP_STORE",
    ]

    for (const source of allSources) {
        if (!loadedFromFiles.has(source) && !registry.has(source)) {
            registry.set(source, createGenericAdapter(source))
            console.log(`[SOURCE_REGISTRY] Registered generic Crawl4AI adapter for: ${source}`)
        }
    }
}

loadSources().catch((err) => {
    console.error("Failed to load scraper sources:", err)
    process.exit(1)
})

export function getAdapter(source: ScrapingSourceType): SourceAdapter {
    const adapter = registry.get(source)

    if (!adapter) {
        // This should never happen now since we register generic adapters for all sources
        return createGenericAdapter(source)
    }

    return adapter
}

export function getRegisteredSource(): Array<ScrapingSourceType> {
    return [...registry.keys()]
}

export function isRegistered(source: ScrapingSourceType): boolean {
    return registry.has(source)
}