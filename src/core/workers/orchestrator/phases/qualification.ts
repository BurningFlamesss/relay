import { aiQueueEvents, enqueueAITask } from "#/core/queues.ts";
import { AI_CALL_TIMEOUT_MS, type ClusterLabelingResult } from "#/core/types.ts";
import type { PhaseContext } from "../context";
import { updatePhase } from "../phase-tracker";

export async function runOpportunityQualification(context: PhaseContext, clusterResult: ClusterLabelingResult, isDone: (phase: string) => boolean): Promise<void> {
    if (isDone("OPPORTUNITY_QUALIFICATION")) {
        return
    }

    await updatePhase(context.jobId, "OPPORTUNITY_QUALIFICATION", "RUNNING")

    const topClusters = clusterResult.clusters.slice(0, 3)

    // TODO: Spawn scraper jobs
    // TODO: Call AI

    const whyNowJob = await enqueueAITask({
        jobId: context.jobId,
        task: "WHY_NOW",
        payload: {
            topClusters: topClusters.map(cluster => ({
                label: cluster.label,
                evidenceChain: cluster.evidenceChain
            })),
            instruction: "Identify the recent regulation, platform shift, or technology chnage that makes this problem newly solvable or more acute. Ground every claim in the evidence."
        }
    })

    await whyNowJob.waitUntilFinished(aiQueueEvents, AI_CALL_TIMEOUT_MS)

    // TODO: Persist whyNow to IdeaCandidate

    await updatePhase(context.jobId, "OPPORTUNITY_QUALIFICATION", "COMPLETED", {
        summary: "Trend data, demand counts, why-now factor collected"
    })
}