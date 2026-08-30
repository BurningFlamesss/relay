import { prisma } from "#/db.ts";
import type { PhaseContext } from "../context";
import { updatePhase } from "../phase-tracker";

export interface PreflightResult {
    cacheHit: boolean;
    cacheJobId?: string;
    servedFromCache: boolean;
}

export async function runPreflight(context: PhaseContext): Promise<PreflightResult> {
    const { jobId, topicHash, tier, isDone } = context

    if (isDone("PREFLIGHT")) {
        const row = await prisma.jobPhase.findUnique({
            where: {
                jobId_phase: {
                    jobId,
                    phase: "PREFLIGHT"
                }
            },
            select: {
                output: true
            }
        })

        return (row?.output as PreflightResult) ?? { cacheHit: false, servedFromCache: false }
    }

    await context.progress("PREFLIGHT", "Checking topic cache...")
    await updatePhase(jobId, "PREFLIGHT", "RUNNING")

    const cached = await prisma.topicCache.findUnique({
        where: {
            topicHash
        }
    })
    const cacheHit = !!(cached && cached.cacheExpiresAt > new Date())

    const servedFromCache = cacheHit && tier === "LOW"

    if (servedFromCache && cached) {
        await prisma.analysisJob.update({
            where: {
                id: jobId
            },
            data: {
                status: "COMPLETED",
                completedAt: new Date(),
                servedFromCacheId: cached.representativeJobId
            }
        })
        await context.phaseDone("PREFLIGHT", "Served from cache")
    }

    const result: PreflightResult = {
        cacheHit, 
        cacheJobId: cached?.representativeJobId,
        servedFromCache
    }

    await updatePhase(jobId, "PREFLIGHT", "COMPLETED", {
        output: result,
        summary: cacheHit ? `Cache hit - job ${cached.representativeJobId}` : "No cache hit - full analysis"
    })

    return result
}