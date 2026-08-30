import type { ScraperJobData, ScraperResult } from "#/core/types.ts";
import { prisma } from "#/db.ts";
import { UnrecoverableError, type Job } from "bullmq";
import { getAdapter } from "./sources";

const MAX_SIGNALS_PER_SOURCE = 300

export async function processScrapeJob(job: Job<ScraperJobData>): Promise<ScraperResult> {
    const { jobId, scrapeJobId, source, queries, userId, iterationNumber, excludedDomainHashes } = job.data
    const startedAt = Date.now()

    await prisma.scrapeJob.update({
        where: {
            id: scrapeJobId
        },
        data: {
            status: "RUNNING",
            startedAt: new Date()
        }
    })

    await job.updateProgress({
        source,
        message: `Scraping ${source}...`
    })

    const adapter = getAdapter(source)
    const excludedSet = new Set(excludedDomainHashes)

    let rawSignals = []

    try {
        rawSignals = await adapter.scrape(queries, {
            jobId,
            maxSignals: MAX_SIGNALS_PER_SOURCE,
            excludedDomainHashes: excludedSet
        })

        if (rawSignals.length === 0) {
            console.warn(`[SCRAPER] ${source} returned 0 signals for job ${jobId} - check credentials / rate limits`)
        }
    } catch (error: any) {
        await prisma.scrapeJob.update({
            where: {
                id: scrapeJobId
            },
            data: {
                status: "FAILED",
                errorMessage: error?.message ?? "",
                completedAt: new Date()
            }
        })

        if (isPermanentError(error)) {
            throw new UnrecoverableError(`Permanent failure on ${source}: ${error?.message ?? ""}`)
        }

        throw error
    }


}

function isPermanentError(error: Error): boolean {
    const message = error.message.toLowerCase()

    return message.includes("403") || message.includes("401") || message.includes("permanently blocked") || message.includes("ip banned")
}