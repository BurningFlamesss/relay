import type { ScraperJobData, ScraperResult } from "#/core/types.ts";
import { prisma } from "#/db.ts";
import { UnrecoverableError  } from "bullmq";
import type {Job} from "bullmq";
import { getAdapter } from "./sources";
import { createHash } from "node:crypto";
import { bufferSignals, publishProgress } from "#/core/redis.ts";

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

    // Publish detailed start event
    await publishProgress({
        type: "SCRAPE_SOURCE_START",
        jobId,
        source,
        message: `Starting to scrape ${source}...`,
        timestamp: Date.now(),
        metadata: {
            queries: queries.map(q => q.query),
            iterationNumber
        }
    })

    const adapter = getAdapter(source)
    const excludedSet = new Set(excludedDomainHashes)

    let rawSignals = []

    try {
        // Add timeout wrapper to prevent hanging
        rawSignals = await Promise.race([
            adapter.scrape(queries, {
                jobId,
                maxSignals: MAX_SIGNALS_PER_SOURCE,
                excludedDomainHashes: excludedSet
            }),
            new Promise<never>((_, reject) => 
                setTimeout(() => reject(new Error("Scrape timeout")), 85000)
            )
        ])

        if (rawSignals.length === 0) {
            console.warn(`[SCRAPER] ${source} returned 0 signals for job ${jobId} - check credentials / rate limits / Crawl4AI health`)
        }
    } catch (error: any) {
        const errorMessage = error?.message ?? "Unknown error"
        console.error(`[SCRAPER] ${source} failed for job ${jobId}:`, errorMessage)
        
        // Publish failure event
        await publishProgress({
            type: "SCRAPE_SOURCE_FAILED",
            jobId,
            source,
            message: `Failed to scrape ${source}`,
            error: errorMessage,
            timestamp: Date.now()
        })
        
        await prisma.scrapeJob.update({
            where: {
                id: scrapeJobId
            },
            data: {
                status: "FAILED",
                errorMessage,
                completedAt: new Date()
            }
        })

        if (isPermanentError(error)) {
            throw new UnrecoverableError(`Permanent failure on ${source}: ${errorMessage}`)
        }

        // For transient errors, allow retry
        throw error
    }

    const seen: Set<string> = new Set()

    const filtered = rawSignals.filter((signal) => {
        if (!signal.urlHash || seen.has(signal.urlHash)) {
            return false
        }

        if (excludedSet.has(hashDomain(extractDomain(signal.url)))) {
            return false
        }

        if (!signal.quote || signal.quote.trim().length < 20) {
            return false
        }

        seen.add(signal.urlHash)

        return true
    })

    if (filtered.length > 0) {
        await bufferSignals(jobId, source, filtered)
    }

    await publishProgress({
        type: "SCRAPE_SOURCE_DONE",
        jobId,
        signalCount: filtered.length,
        message: `${source}: ${filtered.length} signals (${rawSignals.length - filtered.length}) filtered)`,
        timestamp: Date.now()
    })

    await prisma.scrapeJob.update({
        where: {
            id: scrapeJobId
        },
        data: {
            status: "COMPLETED",
            signalCount: filtered.length,
            completedAt: new Date()
        }
    })

    return {
        source,
        signalCount: filtered.length,
        redisKey: `job:${jobId}:signals:${source}`,
        skippedCount: rawSignals.length - filtered.length,
        durationMs: Date.now() - startedAt
    }

}

function extractDomain(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "")
    } catch (error) {
        return url
    }
}

function hashDomain(domain: string): string {
    return createHash("sha256").update(domain.toLowerCase().trim()).digest("hex")
}

function isPermanentError(error: Error): boolean {
    const message = error.message.toLowerCase()

    return message.includes("403") || message.includes("401") || message.includes("permanently blocked") || message.includes("ip banned")
}