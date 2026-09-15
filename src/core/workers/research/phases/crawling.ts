import { prisma } from "#/db.ts";
import { serverEnv } from "#/env/server.ts";
import type { PhaseContext } from "#/core/workers/orchestrator/context.ts";
import { updateResearchPhase } from "../phase-tracker.ts";
import { publishProgress } from "#/core/redis.ts";
import { createCrawlerService } from "#/core/crawler/service.ts";
import type { CrawlOptions, CrawlResult } from "#/core/crawler/service.ts";
import { createHash } from "node:crypto"

const MAX_CONCURRENT_CRAWLS = 3

export async function runResearchCrawling(context: PhaseContext, iterationNumber = 0): Promise<void> {
    const { jobId, isDone } = context

    if (isDone("RESEARCH_CRAWLING") && iterationNumber === 0) {
        return
    }

    const phaseName = iterationNumber === 0 ? "RESEARCH_CRAWLING" : `RESEARCH_CRAWLING_ITER_${iterationNumber}`

    if (iterationNumber === 0) {
        await context.progress("RESEARCH_CRAWLING", "Crawling sources with Crawl4AI...")
        await updateResearchPhase(jobId, "RESEARCH_CRAWLING", "RUNNING")
        await prisma.researchJob.update({
            where: { id: jobId },
            data: { currentStage: "crawling" },
        })
    } else {
        await context.progress("RESEARCH_CRAWLING", `Crawling iteration ${iterationNumber + 1}...`)
    }

    const sources = await prisma.researchSource.findMany({
        where: {
            jobId,
            enabled: true,
            ...(iterationNumber === 0 ? {} : { crawlStatus: { in: ["PENDING", "FAILED"] } }),
        },
        orderBy: { priority: "desc" },
    })

    if (sources.length === 0) {
        if (iterationNumber === 0) {
            await updateResearchPhase(jobId, "RESEARCH_CRAWLING", "FAILED", {
                errorMessage: "No sources to crawl",
            })
        }
        return
    }

    const crawler = createCrawlerService()

    let processedCount = 0
    let failedCount = 0

    for (let i = 0; i < sources.length; i += MAX_CONCURRENT_CRAWLS) {
        const batch = sources.slice(i, i + MAX_CONCURRENT_CRAWLS)

        for (const source of batch) {
            let results: CrawlResult[]
            
            // Use sourceType-aware crawling
            const sourceType = source.sourceType ?? "WEB"
            const crawlOptions: CrawlOptions = {
                concurrency: 1,
                timeoutMs: serverEnv.RESEARCH_CRAWL_TIMEOUT_MS,
                extractLinks: true,
                extractMedia: false,
                sourceType: source.sourceType as "WEB" | "RSS" | "API",
                apiParams: source.sourceType === "API" ? { 
                    query: source.name,
                    max_results: 50 
                } : undefined,
            }

            try {
                console.log(`[CRAWLING] Processing ${source.name} (${source.sourceType}) - ${source.url}`)
                const results = await crawler.crawlSourceByType(source.url, sourceType as "WEB" | "RSS" | "API", crawlOptions)
                
                // For RSS/API, we might get multiple results; for WEB, we get 1
                for (const result of results) {
                    if (result.success) {
                        await prisma.researchSource.update({
                            where: { id: source.id },
                            data: {
                                crawlStatus: "COMPLETED",
                                crawlError: null,
                                crawledAt: new Date(),
                                pagesCrawled: 1,
                            },
                        })

                        const content = result.markdown ?? result.text ?? ""
                        const contentHash = createHash("sha256").update(content + result.url).digest("hex").slice(0, 32)

                        await prisma.researchDocument.upsert({
                            where: { contentHash },
                            create: {
                                id: `doc-${jobId}-${source.id}-${Date.now()}`,
                                jobId,
                                sourceId: source.id,
                                url: result.url,
                                canonicalUrl: undefined,
                                title: result.title,
                                description: result.description,
                                author: result.author,
                                publishedAt: result.publishedAt ? new Date(result.publishedAt) : null,
                                domain: source.domain,
                                content: content || "Content extracted via " + sourceType,
                                markdown: result.markdown ?? undefined,
                                headings: result.headings?.map(h => `${"#".repeat(h.level)} ${h.text}`) ?? [],
                                language: result.language,
                                wordCount: result.wordCount ?? content.length ?? 0,
                                contentHash,
                                metadata: result.metadata as any,
                                status: "PENDING",
                            },
                            update: {
                                jobId,
                                sourceId: source.id,
                                url: result.url,
                                title: result.title,
                                description: result.description,
                                author: result.author,
                                publishedAt: result.publishedAt ? new Date(result.publishedAt) : null,
                                domain: source.domain,
                                content: content || "Content extracted via " + sourceType,
                                markdown: result.markdown ?? undefined,
                                headings: result.headings?.map(h => `${"#".repeat(h.level)} ${h.text}`) ?? [],
                                language: result.language,
                                wordCount: result.wordCount ?? content.length ?? 0,
                                metadata: result.metadata as any,
                                status: "PENDING",
                            },
                        })

                        processedCount++
                    } else {
                        await prisma.researchSource.update({
                            where: { id: source.id },
                            data: {
                                crawlStatus: "FAILED",
                                crawlError: result.error ?? "Crawl failed",
                                crawledAt: new Date(),
                                pagesCrawled: 0,
                            },
                        })
                        failedCount++
                    }
                }
            } catch (error) {
                console.error(`[CRAWLING] Error processing ${source.name}:`, error)
                await prisma.researchSource.update({
                    where: { id: source.id },
                    data: {
                        crawlStatus: "FAILED",
                        crawlError: error instanceof Error ? error.message : "Crawl failed",
                        crawledAt: new Date(),
                        pagesCrawled: 0,
                    },
                })
                failedCount++
            }
        }

        await publishProgress({
            type: "SIGNAL_COUNT_UPDATE",
            jobId,
            signalCount: processedCount,
            message: `${processedCount} sources crawled, ${failedCount} failed`,
            timeStamp: Date.now(),
        })
    }

    if (iterationNumber === 0) {
        await updateResearchPhase(jobId, "RESEARCH_CRAWLING", "COMPLETED", {
            summary: `${processedCount} sources crawled successfully, ${failedCount} failed`,
        })
        await context.phaseDone("RESEARCH_CRAWLING", `${processedCount} sources crawled`)
    }
}