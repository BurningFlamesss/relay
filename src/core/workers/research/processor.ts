import type { OrchestratorJobData } from "#/core/types.ts"
import type { Job } from "bullmq"
import { prisma } from "#/db.ts"
import { publishProgress } from "#/core/redis.ts"
import { dlQueue } from "#/core/queues.ts"
import { loadResearchCompletedPhases, updateResearchPhase } from "./phase-tracker.ts"
import type { PhaseContext } from "#/core/workers/orchestrator/context.ts"
import {
    runResearchPlanning,
    runResearchDiscovery,
    runResearchCrawling,
    runResearchExtraction,
    runResearchAnalysis,
    runResearchSynthesis,
} from "./phases"

export async function processResearchJob(job: Job<OrchestratorJobData>): Promise<void> {
    const { jobId, userId, topic, topicHash, tier, maxIterations, filters } = job.data

    await prisma.researchJob.update({
        where: { id: jobId },
        data: {
            status: "PLANNING",
            currentStage: "planning",
        },
    })

    let completedPhases = await loadResearchCompletedPhases(jobId)
    const isDone = (phase: string) => completedPhases.has(phase as any)

    const refreshDone = async () => {
        completedPhases = await loadResearchCompletedPhases(jobId)
    }

    const progress = async (phase: string, message: string, extra?: Record<string, unknown>) => {
        await Promise.all([
            job.updateProgress({ phase, message, ...extra }),
            publishProgress({
                type: "PHASE_START",
                jobId,
                phase: phase as any,
                message,
                timestamp: Date.now(),
            }),
        ])
    }

    const phaseDone = async (phase: string, message: string, extra?: Record<string, unknown>) => {
        await publishProgress({
            type: "PHASE_COMPLETE",
            jobId,
            phase: phase as any,
            message,
            timestamp: Date.now(),
        })
    }

    const context: PhaseContext = {
        jobId,
        userId,
        topic,
        topicHash,
        tier,
        maxIterations,
        filters,
        job,
        isDone: (p: any) => isDone(p),
        refreshDone,
        progress,
        phaseDone,
    }

    try {
        const plan = await runResearchPlanning(context)
        await refreshDone()

        await runResearchDiscovery(context, plan)
        await refreshDone()

        await runResearchCrawling(context, 0)
        await refreshDone()

        await runResearchExtraction(context)
        await refreshDone()

        await runResearchAnalysis(context)
        await refreshDone()

        await runResearchSynthesis(context)

        await publishProgress({
            type: "DONE",
            jobId,
            message: "Research completed",
            timestamp: Date.now(),
        })

    } catch (error) {
        console.error(`[RESEARCH] Job ${jobId} failed:`, error)

        await prisma.researchJob.update({
            where: { id: jobId },
            data: {
                status: "FAILED",
                errorMessage: error instanceof Error ? error.message : "Unknown error",
            },
        }).catch(() => {})

        await publishProgress({
            type: "FATAL",
            jobId,
            error: error instanceof Error ? error.message : "Unknown error",
            message: "Research failed",
            timestamp: Date.now(),
        })

        throw error
    }
}