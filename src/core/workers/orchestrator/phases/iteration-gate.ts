import { aiQueueEvents, enqueueAITask } from "#/core/queues.ts";
import { publishProgress } from "#/core/redis.ts";
import { AI_CALL_TIMEOUT_MS, ITERATION_THRESHOLD, type ClusterLabelingResult, type QueryArchitectureResult } from "#/core/types.ts";
import { prisma } from "#/db.ts";
import type { PhaseContext } from "../context";
import { updatePhase } from "../phase-tracker";
import { runClustering } from "./clustering";
import { runPreprocessing } from "./preprocessing";
import { runScrapingPass } from "./scraping";

export interface IterationGateResult {
    finalClusterResult: ClusterLabelingResult;
    iterationsDone: number;
    thresholdMet: boolean;
}

export async function runIterationGate(context: PhaseContext, clusterResult: ClusterLabelingResult, initialQueries: Array<{
    query: string;
    intentLabel: any
}>): Promise<IterationGateResult> {
    const { jobId, tier, maxIterations, isDone } = context

    if (tier === "LOW" || maxIterations === 0) {
        await updatePhase(jobId, "ITERATION_GATE", "SKIPPED", {
            summary: tier === "LOW" ? "Low tier - skipped" : "maxIterations = 0"
        })

        return {
            finalClusterResult: clusterResult,
            iterationsDone: 0,
            thresholdMet: false
        }
    }

    if (isDone("ITERATION_GATE")) {
        const finalCLuster = await runClustering(context)
        const job = await prisma.analysisJob.findUnique({
            where: {
                id: jobId
            },
            select: {
                iterationsDone: true
            }
        })

        return {
            finalClusterResult: finalCLuster,
            iterationsDone: job?.iterationsDone ?? 0,
            thresholdMet: true
        }
    }

    await prisma.analysisJob.update({
        where: {
            id: jobId
        },
        data: {
            currentPhase: "ITERATION_GATE"
        }
    })

    const jobState = await prisma.analysisJob.findUnique({
        where: {
            id: jobId
        },
        select: {
            iterationsDone: true
        }
    })

    let iterationsDone = jobState?.iterationsDone ?? 0
    let currentClusters = clusterResult
    let topScore = clusterResult.clusters[0]?.compositeScore ?? 0

    while (topScore < ITERATION_THRESHOLD && iterationsDone < maxIterations) {
        await publishProgress({
            type: "ITERATION_START",
            jobId,
            iterationsDone,
            message: `Score ${topScore.toFixed(2)} < ${ITERATION_THRESHOLD} - drilling down (${iterationsDone + 1}/${maxIterations})`,
            timeStamp: Date.now()
        })

        await prisma.analysisJob.update({
            where: {
                id: jobId
            },
            data: {
                status: "ITERATING",
                iterationsDone
            }
        })

        const drillJob = await enqueueAITask({
            jobId,
            task: "DRILL_DOWN_QUERIES",
            payload: {
                topClusterLabel: currentClusters.clusters[0]?.label ?? "",
                existingQueryCount: initialQueries.length,
                targetNewQueries: 10
            }
        })

        const drillResult = (await drillJob.waitUntilFinished(aiQueueEvents, AI_CALL_TIMEOUT_MS)) as QueryArchitectureResult

        await runScrapingPass(context, drillResult.queries, iterationsDone + 1)
        await runPreprocessing(context, true)

        currentClusters = await runClustering(context)
        topScore = currentClusters.clusters[0]?.compositeScore ?? 0
        iterationsDone++

        await prisma.analysisJob.update({
            where: {
                id: jobId
            },
            data: {
                iterationsDone
            }
        })

        await publishProgress({
            type: "ITERATION_COMPLETE",
            jobId,
            iterationsDone,
            message: `Iteration ${iterationsDone} done - top score: ${topScore.toFixed(2)}`,
            timeStamp: Date.now()
        })
    }

    await updatePhase(jobId, "ITERATION_GATE", "COMPLETED", {
        summary: `${iterationsDone} iteration(s) - final score: ${topScore.toFixed(2)}`,
        output: {
            iterationsDone,
            finalTopScore: topScore,
            thresholdMet: topScore >= ITERATION_THRESHOLD
        }
    })

    return {
        finalClusterResult: currentClusters,
        iterationsDone,
        thresholdMet: topScore >= ITERATION_THRESHOLD
    }
}