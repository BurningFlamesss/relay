import type { ScrapingSourceType, SourceAdapter, ScrapeOptions, RawSignal } from "#/core/types.ts";
import { readdirSync } from "node:fs";
import { extname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCrawlerService } from "#/core/crawler/service.ts";

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

            for (const { query } of queries) {
                try {
                    const results = await crawler.searchAndCrawl(query, {
                        maxResults: Math.min(options.maxSignals / queries.length + 5, 50),
                        timeoutMs: 60000,
                        extractLinks: true,
                        extractMedia: false,
                    })

                    for (const result of results) {
                        if (result.success && result.text && result.text.length > 100) {
                            const encoder = new TextEncoder()
                            const data = encoder.encode(result.url)
                            const hashBuffer = await crypto.subtle.digest("SHA-256", data)
                            const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("")

                            signals.push({
                                url: result.url,
                                urlHash: hashHex,
                                title: result.title,
                                quote: result.text.slice(0, 500),
                                authorHandle: undefined,
                                publishedAt: result.publishedAt,
                            })
                        }
                    }
                } catch (error) {
                    console.warn(`[SCRAPER] Crawl4AI search failed for query "${query}":`, error)
                }
            }

            return signals
        },
    }
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