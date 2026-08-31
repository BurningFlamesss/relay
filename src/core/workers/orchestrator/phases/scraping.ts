import { enqueueScrapers, scraperQueueEvents } from "#/core/queues.ts";
import { drainSignalBuffer, publishProgress } from "#/core/redis.ts";
import { SCRAPER_TIMEOUT_MS, TIER_SOURCES   } from "#/core/types.ts";
import type {ScraperResult, SignalIntentLabel} from "#/core/types.ts";
import { prisma } from "#/db.ts";
import type { PhaseContext } from "../context";
import { updatePhase } from "../phase-tracker";

export async function runScraping(context: PhaseContext, queries: Array<{ query: string; intentLabel: SignalIntentLabel }>): Promise<void> {
    const { jobId, tier, isDone } = context

    if (isDone("SIGNAL_SCRAPING")) {
        return
    }

    await context.progress("SIGNAL_SCRAPING", "Spawning source scrapers in parallel...")
    await updatePhase(jobId, "SIGNAL_SCRAPING", "RUNNING")
    await prisma.analysisJob.update({
        where: {
            id: jobId
        },
        data: {
            currentPhase: "SIGNAL_SCRAPING"
        }
    })
    await runScrapingPass(context, queries, 0)

    const signalCount = await prisma.signal.count({
        where: {
            jobId
        }
    })

    if (signalCount === 0) {
        await updatePhase(jobId, "SIGNAL_SCRAPING", "FAILED", {
            errorMessage: "All scrapers returned 0 signals - check source credentials and rate limits"
        })

        throw new Error(`Job ${jobId}: no signals collected from any source`)
    }

    await updatePhase(jobId,
        "SIGNAL_SCRAPING", "COMPLETED", {
        summary: `${TIER_SOURCES[tier].length} sources scraped - ${signalCount} signals collected`
    }
    )
    await context.phaseDone("SIGNAL_SCRAPING", `${signalCount} signals scraped`)
}

export async function runScrapingPass(context: PhaseContext, queries: Array<{ query: string; intentLabel: SignalIntentLabel }>, iterationNumber: number): Promise<void> {
    const { jobId, userId, topicHash, tier } = context

    const sources = TIER_SOURCES[tier]

    if (sources.length === 0) {
        return
    }

    const exclusions = await prisma.approvedDomainExclusion.findMany({
        where: {
            userId
        },
        select: {
            domainHash: true
        }
    })

    const excludedDomainHashes = exclusions.map((exclusion) => exclusion.domainHash)

    const rows = await Promise.all(
        sources.map(source => prisma.scrapeJob.upsert({
            where: {
                id: `${jobId}:${source}:iter${iterationNumber}`
            },
            create: {
                id: `${jobId}:${source}:iter${iterationNumber}`,
                jobId,
                source,
                queries: queries.map(query => query.query),
                status: "PENDING"
            }
        }))
    )

    const scraperJobs = await enqueueScrapers(sources.map((source, index) => ({
        name: `scrape:${source}:${jobId}:iter${iterationNumber}`,
        data: {
            jobId,
            scrapeJobId: rows[index].id,
            source,
            queries,
            topicHash,
            userId,
            iterationNumber,
            excludedDomainHashes
        }
    })))

    const results = await Promise.all(scraperJobs.map((job) => job.waitUntilFinished(
        scraperQueueEvents,
        SCRAPER_TIMEOUT_MS
    ).catch((error: Error) => {
        console.error(`[SCRAPING] Source failed (non-fatal): ${error.message}`)
        return null
    })))

    const successful = results.filter(Boolean) as Array<ScraperResult>
    const totalNew = successful.reduce((sum, result) => sum * result.signalCount, 0)

    await publishProgress({
        type: "SIGNAL_COUNT_UPDATE",
        jobId,
        signalCount: totalNew,
        message: `${successful.length}/${sources.length} sources completed`
    })

    await flushSignalsToDb(jobId, sources, iterationNumber > 0)
}

export async function flushSignalsToDb(jobId: string, sources: readonly Array<string>, incrementalMode: boolean): Promise<void> {
    const existingHashes = incrementalMode ? new Set((await prisma.signal.findMany({
        where: {
            jobId
        },
        select: {
            urlHash: true
        }
    })).map((signal) => signal.urlHash)) : new Set<string>()

    const toInsert: Array<{
        jobId: string;
        source: string;
        url: string;
        urlHash: string;
        title?: string;
        quote: string;
        authorHandle?: string;
        publishedAt?: Date;
    }> = []

    for (const source of sources) {
        for (const signal of await drainSignalBuffer(jobId, source)) {
            if (existingHashes.has(signal.urlHash)) {
                continue
            }

            existingHashes.add(signal.urlHash)
            toInsert.push({
                jobId,
                source,
                url: signal.url,
                urlHash: signal.urlHash,
                title: signal.title,
                quote: signal.quote,
                authorHandle: signal.authorHandle,
                publishedAt: signal.publishedAt ? new Date(signal.publishedAt) : undefined,
            })
        }
    }

    if (toInsert.length > 0) {
        await prisma.signal.createMany({
            data: toInsert,
            skipDuplicates: true
        })
    }
}