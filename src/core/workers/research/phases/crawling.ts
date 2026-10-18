import { prisma } from "#/db.ts";
import { serverEnv } from "#/env/server.ts";
import type { PhaseContext } from "#/core/workers/orchestrator/context.ts";
import { updateResearchPhase } from "../phase-tracker.ts";
import { publishProgress } from "#/core/redis.ts";
import { createCrawlerService } from "#/core/crawler/service.ts";
import type { CrawlOptions } from "#/core/crawler/service.ts";
import { resolveSourceCrawlTarget } from "#/core/research/source-search.ts";
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

    // The research question drives every source's search query so we crawl
    // topically relevant pages rather than source homepages/feeds.
    const job = await prisma.researchJob.findUnique({
        where: { id: jobId },
        select: { plan: true, question: true },
    })
    const plan = job?.plan as { question?: string } | null
    const researchQuery = (plan?.question ?? job?.question ?? "").trim()

    let processedCount = 0
    let failedCount = 0

    for (let i = 0; i < sources.length; i += MAX_CONCURRENT_CRAWLS) {
        const batch = sources.slice(i, i + MAX_CONCURRENT_CRAWLS)

        for (const source of batch) {
            // Resolve a topic-scoped crawl target for this source.
            const target = resolveSourceCrawlTarget(source, researchQuery)
            const crawlOptions: CrawlOptions = {
                concurrency: 1,
                timeoutMs: serverEnv.RESEARCH_CRAWL_TIMEOUT_MS,
                extractLinks: true,
                extractMedia: false,
                sourceType: target.sourceType,
                apiParams: target.apiParams,
            }

            const crawlStartedAt = Date.now()

            // Tell the user exactly which website/query is about to be scraped
            await publishProgress({
                type: "CRAWL_URL_START",
                jobId,
                url: target.url,
                message: researchQuery
                    ? `Scraping ${source.domain} for "${researchQuery}"`
                    : `Scraping ${source.domain} (${source.name})`,
                timestamp: Date.now(),
                metadata: {
                    name: source.name,
                    domain: source.domain,
                    category: source.category,
                    sourceType: target.sourceType,
                    query: researchQuery || undefined,
                },
            })

            try {
                console.log(`[CRAWLING] Processing ${source.name} (${target.sourceType}) - ${target.url}`)
                const results = await crawler.crawlSourceByType(target.url, target.sourceType, crawlOptions)
                
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
                        // Scope the hash to the job so documents from different
                        // research jobs never overwrite / steal each other.
                        const contentHash = createHash("sha256").update(content + result.url + jobId).digest("hex").slice(0, 32)

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
                                content: content || "Content extracted via " + target.sourceType,
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
                                content: content || "Content extracted via " + target.sourceType,
                                markdown: result.markdown ?? undefined,
                                headings: result.headings?.map(h => `${"#".repeat(h.level)} ${h.text}`) ?? [],
                                language: result.language,
                                wordCount: result.wordCount ?? content.length ?? 0,
                                metadata: result.metadata as any,
                                status: "PENDING",
                            },
                        })

                        processedCount++

                        await publishProgress({
                            type: "CRAWL_URL_DONE",
                            jobId,
                            url: result.url,
                            message: `Scraped ${result.title ?? source.domain}`,
                            duration: Date.now() - crawlStartedAt,
                            signalCount: processedCount,
                            timestamp: Date.now(),
                            metadata: {
                                name: source.name,
                                domain: source.domain,
                                wordCount: result.wordCount ?? content.length ?? 0,
                            },
                        })
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

                        await publishProgress({
                            type: "CRAWL_URL_FAILED",
                            jobId,
                            url: target.url,
                            message: `Failed to scrape ${source.domain}`,
                            error: result.error ?? "Crawl failed",
                            duration: Date.now() - crawlStartedAt,
                            timestamp: Date.now(),
                            metadata: { name: source.name, domain: source.domain },
                        })
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

                await publishProgress({
                    type: "CRAWL_URL_FAILED",
                    jobId,
                    url: target.url,
                    message: `Failed to scrape ${source.domain}`,
                    error: error instanceof Error ? error.message : "Crawl failed",
                    duration: Date.now() - crawlStartedAt,
                    timestamp: Date.now(),
                    metadata: { name: source.name, domain: source.domain },
                })
            }
        }

        await publishProgress({
            type: "SIGNAL_COUNT_UPDATE",
            jobId,
            signalCount: processedCount,
            message: `${processedCount} sources crawled, ${failedCount} failed`,
            timestamp: Date.now(),
        })
    }

    if (iterationNumber === 0) {
        await updateResearchPhase(jobId, "RESEARCH_CRAWLING", "COMPLETED", {
            summary: `${processedCount} sources crawled successfully, ${failedCount} failed`,
        })
        await context.phaseDone("RESEARCH_CRAWLING", `${processedCount} sources crawled`)
    }
}