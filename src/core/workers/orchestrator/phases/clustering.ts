import { aiQueueEvents, enqueueAITask } from "#/core/queues.ts";
import { AI_CALL_TIMEOUT_MS, type ClusterLabelingResult } from "#/core/types.ts";
import { prisma } from "#/db.ts";
import type { PhaseContext } from "../context";
import { loadPhaseOutput, updatePhase } from "../phase-tracker";

export async function runClustering(context: PhaseContext) {
    const { jobId, isDone } = context

    if (isDone("PROBLEM_CLUSTER_SYNTHESIS")) {
        return loadPhaseOutput(jobId, "PROBLEM_CLUSTER_SYNTHESIS")
    }

    await context.progress("PROBLEM_CLUSTER_SYNTHESIS", "Clustering and labelling problems...")
    await updatePhase(jobId, "PROBLEM_CLUSTER_SYNTHESIS", "RUNNING")

    await prisma.analysisJob.update({
        where: {
            id: jobId
        },
        data: {
            currentPhase: "PROBLEM_CLUSTER_SYNTHESIS"
        }
    })

    const signals = await prisma.signal.findMany({
        where: {
            jobId
        },
        select: {
            id: true,
            quote: true,
            source: true,
            authorType: true,
            intentLabel: true,
            intensityScore: true,
            isDemandSignal: true,
            publishedAt: true,
            url: true,
            clusterId: true
        }
    })

    // TODO: Local Embeddings

    const aiJob = await enqueueAITask({
        jobId,
        task: "CLUSTER_LABELING",
        payload: {
            signals, topN: 5
        }
    })

    const result = (await aiJob.waitUntilFinished(aiQueueEvents, AI_CALL_TIMEOUT_MS)) as ClusterLabelingResult

    await prisma.$transaction(async (transaction) => {
        await Promise.all(result.clusters.map((cluster) => {
            const isTop = cluster.clusterId === result.clusters[0].clusterId

            return Promise.all([
                transaction.signalCluster.update({
                    where: {
                        id: cluster.clusterId
                    },
                    data: {
                        label: cluster.label,
                        personaSketches: cluster.personaSketches,
                        failedWorkarounds: cluster.failedWorkarounds,
                        evidenceChain: cluster.evidenceChain,
                        demandSignalCount: cluster.demandSignalCount,
                        compositeScore: cluster.compositeScore
                    }
                }),
                transaction.ideaCandidate.upsert({
                    where: {
                        clusterId: cluster.clusterId
                    },
                    create: {
                        jobId,
                        clusterId: cluster.clusterId,
                        problemLabel: cluster.label,
                        problemSummary: "",
                        targetPersona: cluster.personaSketches[0]?.description,
                        status: isTop ? "ACTIVE" : "STASHED",
                        stashedByUserId: isTop ? undefined : context.userId,
                        stashedAt: isTop ? undefined : new Date()
                    },
                    update: {
                        problemLabel: cluster.label,
                        status: isTop ? "ACTIVE" : "STASHED"
                    }
                })
            ])
        }))
    })

    await updatePhase(jobId, "PROBLEM_CLUSTER_SYNTHESIS", "COMPLETED", {
        output: result,
        summary: `Labelled ${result.clusters.length} clusters`
    })

    await context.phaseDone("PROBLEM_CLUSTER_SYNTHESIS", `${result.clusters.length} clusters`)

    return result
}