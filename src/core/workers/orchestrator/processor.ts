import { ScoringResult } from './../../types';
import type { OrchestratorJobData, PhaseType } from "#/core/types.ts";
import type { Job } from "bullmq";
import { loadCompletedPhases, updatePhase } from "./phase-tracker";
import { publishProgress } from "#/core/redis.ts";
import type { PhaseContext } from "./context";
import { prisma } from "#/db.ts";
import { runPreflight } from "./phases/preflight";
import { runQueryArchitecture } from "./phases/query-architecture";
import { runScraping } from "./phases/scraping";
import { runPreprocessing } from "./phases/preprocessing";
import { runClustering } from "./phases/clustering";
import { runIterationGate } from "./phases/iteration-gate";
import { runCompetitiveDeepDive, runOpportunityQualification } from "./phases/qualification";
import { runMarketSizing } from "./phases/market-sizing";
import { scoringQueue, scoringQueueEvents } from "#/core/queues.ts";
import { runSynthesis } from './phases/synthesis';
import { runDelivery, runReportAssembly } from './phases/delivery';

export async function processAnalysis(job: Job<OrchestratorJobData>): Promise<void> {
    const { jobId, userId, topic, topicHash, tier, maxIterations, filters } = job.data

    let completedPhases = await loadCompletedPhases(jobId)
    const isDone = (phase: PhaseType) => completedPhases.has(phase)

    const refreshDone = async () => {
        completedPhases = await loadCompletedPhases(jobId)
    }

    const progress = async (phase: PhaseType, message: string, extra?: Record<string, unknown>) => {
        await Promise.all([
            job.updateProgress({
                phase, message, ...extra
            }),
            publishProgress({
                type: "PHASE_START",
                jobId,
                phase,
                message,
                timeStamp: Date.now()
            })
        ])
    }

    const phaseDone = async (phase: PhaseType, message: string, extra?: Record<string, unknown>) => {
        await publishProgress({
            type: "PHASE_COMPLETE",
            jobId,
            phase,
            message,
            timeStamp: Date.now()
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
        isDone,
        refreshDone,
        progress,
        phaseDone
    }

    await prisma.analysisJob.update({
        where: {
            id: jobId
        },
        data: {
            status: "RUNNING",
            currentPhase: "PREFLIGHT"
        }
    })

    const preflight = await runPreflight(context)

    if (preflight.servedFromCache) {
        return
    }

    const queryResult = await runQueryArchitecture(context)

    await runScraping(context, queryResult.queries)

    await runPreprocessing(context)

    let clusterResult = await runClustering(context)
    await refreshDone()


    const iterationResult = await runIterationGate(context, clusterResult, queryResult.queries)
    clusterResult = iterationResult.finalClusterResult
    await refreshDone()

    const phase6Done = isDone("OPPORTUNITY_QUALIFICATION")
    const phase7Done = isDone("COMPETITIVE_DEEP_DIVE")

    if (!phase6Done || !phase7Done) {
        await progress("OPPORTUNITY_QUALIFICATION", "Qualifying opportunity and mapping competition in parallel...")
        await prisma.analysisJob.update({
            where: {
                id: jobId
            },
            data: {
                currentPhase: "OPPORTUNITY_QUALIFICATION"
            }
        })
        await Promise.all([
            phase6Done ? Promise.resolve() : runOpportunityQualification(context, clusterResult, isDone),
            phase7Done ? Promise.resolve() : runCompetitiveDeepDive(context, clusterResult, isDone)
        ])

        await phaseDone("OPPORTUNITY_QUALIFICATION", "Opportunity and competitive analysis complete")
    }

    await runMarketSizing(context)

    if (!isDone("SCORING")) {
        await progress("SCORING", "Computing dimension scores...")
        await prisma.analysisJob.update({
            where: {
                id: jobId
            },
            data: {
                currentPhase: "SCORING"
            }
        })

        const candidates = await prisma.ideaCandidate.findMany({
            where: {
                jobId,
                status: "ACTIVE"
            },
            select: {
                id: true
            }
        })

        const scoringJob = await scoringQueue.add(`scoring:${jobId}`, {
            jobId,
            clusterIds: candidates.map((candidate) => candidate.id)
        }, {
            jobId: `scoring:${jobId}`
        })


        const scoringResult = await scoringJob.waitUntilFinished(scoringQueueEvents, 60_000)

        await updatePhase(jobId, "SCORING", "COMPLETED", {
            summary: `Top composite: ${scoringResult.topScore.toFixed(2)}`
        })
        await phaseDone("SCORING", `Top score: ${scoringResult.topScore.toFixed(2)}`)
    }

    await runSynthesis(context)

    await runReportAssembly(context)

    await runDelivery(context)
}