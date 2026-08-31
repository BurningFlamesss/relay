import { prisma } from "#/db.ts";
import { serverEnv } from "#/env/server.ts";
import type { PhaseContext } from "#/core/workers/orchestrator/context.ts";
import { updatePhase } from "#/core/workers/orchestrator/phase-tracker.ts";
import { publishProgress } from "#/core/redis.ts";
import { createCrawlerService } from "#/core/crawler/service.ts";
import type { CrawlOptions } from "#/core/crawler/service.ts";

const MAX_CONCURRENT_CRAWLS = 3

export async function runResearchCrawling(context: PhaseContext, iterationNumber = 0): Promise<void> {
    const { jobId, isDone } = context

    if (isDone("RESEARCH_CRAWLING") && iterationNumber === 0) {
        return
    }

    const phaseName = iterationNumber === 0 ? "RESEARCH_CRAWLING" : `RESEARCH_CRAWLING_ITER_${iterationNumber}`

    if (iterationNumber === 0) {
        await context.progress("RESEARCH_CRAWLING", "Crawling sources with Crawl4AI...")
        await updatePhase(jobId, "RESEARCH_CRAWLING", "RUNNING")
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
            await updatePhase(jobId, "RESEARCH_CRAWLING", "FAILED", {
                errorMessage: "No sources to crawl",
            })
        }
        return
    }

    const crawler = createCrawlerService()

    const crawlOptions: CrawlOptions = {
        concurrency: MAX_CONCURRENT_CRAWLS,
        timeoutMs: serverEnv.RESEARCH_CRAWL_TIMEOUT_MS,
        extractLinks: true,
        extractMedia: false,
    }

    let processedCount = 0
    let failedCount = 0

    for (let i = 0; i < sources.length; i += MAX_CONCURRENT_CRAWLS) {
        const batch = sources.slice(i, i + MAX_CONCURRENT_CRAWLS)
        const urls = batch.map(s => s.url)

        const results = await crawler.crawlUrls(urls, crawlOptions)

        for (let j = 0; j < batch.length; j++) {
            const source = batch[j]
            const result = results[j]

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

                await prisma.researchDocument.create({
                    data: {
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
                        content: result.markdown ?? result.text ?? "",
                        markdown: result.markdown ?? undefined,
                        headings: result.headings?.map(h => `${"#".repeat(h.level)} ${h.text}`) ?? [],
                        language: result.language,
                        wordCount: result.wordCount ?? 0,
                        contentHash: "",
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

        await publishProgress({
            type: "SIGNAL_COUNT_UPDATE",
            jobId,
            signalCount: processedCount,
            message: `${processedCount} sources crawled, ${failedCount} failed`,
            timeStamp: Date.now(),
        })
    }

    if (iterationNumber === 0) {
        await updatePhase(jobId, "RESEARCH_CRAWLING", "COMPLETED", {
            summary: `${processedCount} sources crawled successfully, ${failedCount} failed`,
        })
        await context.phaseDone("RESEARCH_CRAWLING", `${processedCount} sources crawled`)
    }
}