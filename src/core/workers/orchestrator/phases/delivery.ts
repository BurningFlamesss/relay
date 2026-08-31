import { getUtilityConnection, publishProgress, redisKeys } from "#/core/redis.ts";
import { REPORT_CACHE_TTL_SECONDS } from "#/core/types.ts";
import { prisma } from "#/db.ts";
import type { PhaseContext } from "../context";
import { updatePhase } from "../phase-tracker";

export async function runReportAssembly(context: PhaseContext) {
    const { jobId, isDone } = context

    if (isDone("REPORT_ASSEMBLY")) {
        return
    }

    await context.progress("REPORT_ASSEMBLY", "Assembling final report...")
    await updatePhase(jobId, "REPORT_ASSEMBLY", "RUNNING")
    await assembleReport(jobId)
    await updatePhase(jobId, "REPORT_ASSEMBLY", "COMPLETED", {
        summary: "Timeline chart, competitor landscape, and browsable signals assembled"
    })
}

export async function runDelivery(context: PhaseContext): Promise<void> {
    const { jobId, userId } = context

    await context.progress("DELIVERY", "Delivering report to client...")
    await prisma.analysisJob.update({
        where: {
            id: jobId
        },
        data: {
            currentPhase: "DELIVERY"
        }
    })

    const stashedCount = await prisma.ideaCandidate.count({
        where: {
            jobId,
            status: "STASHED"
        }
    })


    await prisma.analysisJob.update({
        where: {
            id: jobId
        },
        data: {
            status: "COMPLETED",
            currentPhase: "DELIVERY",
            completedAt: new Date()
        }
    })

    await prisma.topicCache.upsert({
        where: {
            topicHash: context.topicHash
        },
        create: {
            topicHash: context.topicHash,
            topicNormalised: context.topic.toLowerCase().trim(),
            lastAnalysedAt: new Date(),
            cacheExpiresAt: new Date(Date.now() + 30 * 86_400_000),
            representativeJobId: jobId
        },
        update: {
            lastAnalysedAt: new Date(),
            cacheExpiresAt: new Date(Date.now() + 30 * 86_400_000),
            representativeJobId: jobId,
            hitCount: {
                set: 0
            }
        }
    })

    if (stashedCount > 0) {
        await prisma.notification.create({
            data: {
                userId,
                title: `${stashedCount} saved candidate${stashedCount > 1 ? "s" : ""} from this analysis`,
                body: "These can be promoted to a full analysis at Phase 6 cost only.",
                link: `/jobs/${jobId}/candidates`
            }
        })
    }

    await publishProgress({
        type: "DONE",
        jobId,
        message: "Analysis complete",
        timeStamp: Date.now()
    })
}

async function assembleReport(jobId: string): Promise<void> {
    const yearAgo = new Date(Date.now() - 365 * 86_400_000)
    const signals = await prisma.signal.findMany({
        where: {
            jobId,
            publishedAt: {
                gte: yearAgo
            }
        },
        select: {
            publishedAt: true,
            source: true
        },
        orderBy: {
            publishedAt: "asc"
        }
    })

    const buckets: Record<string, number> = {}

    for (const signal of signals) {
        if (!signal.publishedAt) {
            continue
        }

        const key = signal.publishedAt.toISOString().slice(0, 7)
        buckets[key] = (buckets[key] ?? 0) + 1
    }

    const signalTimelineChart = {
        dates: Object.keys(buckets),
        counts: Object.values(buckets)
    }

    const browsable = await prisma.signal.findMany({
        where: {
            jobId
        },
        select: {
            id: true,
            quote: true,
            source: true,
            url: true,
            authorHandle: true,
            authorType: true,
            intentLabel: true,
            intensityScore: true,
            isDemandSignal: true,
            publishedAt: true
        },
        orderBy: [{
            intensityScore: "desc"
        }, {
            publishedAt: "desc"
        }],
        take: 500
    })

    const topCandidate = await prisma.ideaCandidate.findFirst({
        where: {
            jobId
        },
        orderBy: {
            compositeScore: "desc"
        },
        select: {
            competitorMap: true
        }
    })

    const redis = getUtilityConnection()
    await redis.setex(
        redisKeys.reportCache(jobId),
        REPORT_CACHE_TTL_SECONDS,
        JSON.stringify({
            signalTimelineChart,
            browsableSignals: browsable,
            competitorLandscape: topCandidate?.competitorMap
        })
    )

    await prisma.idea.update({
        where: {
            jobId
        },
        data: {
            signalTimelineChart,
            competitorLandscape: topCandidate?.competitorMap ?? {},
            browsableSignals: browsable
        }
    })
}

export async function deliverFromCache(jobId: string, cachedJobId: string): Promise<void> {
    const cached = await prisma.idea.findFirst({
        where: {
            jobId: cachedJobId
        }
    })

    if (!cached) {
        return
    }

    await prisma.analysisJob.update({
        where: {
            id: jobId
        },
        data: {
            status: "COMPLETED",
            completedAt: new Date(),
            servedFromCacheId: cachedJobId
        }
    })

    await publishProgress({
        type: "DONE",
        jobId,
        message: "Served from cache",
        timeStamp: Date.now()
    })
}