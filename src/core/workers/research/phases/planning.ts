import { aiQueueEvents, enqueueAITask } from "#/core/queues.ts";
import { AI_CALL_TIMEOUT_MS } from "#/core/types.ts";
import type { QueryArchitectureResult } from "#/core/types.ts";
import { prisma } from "#/db.ts";
import { createHash } from "node:crypto";
import type { PhaseContext } from "#/core/workers/orchestrator/context.ts";
import { loadPhaseOutput, updatePhase } from "#/core/workers/orchestrator/phase-tracker.ts";

export async function runResearchPlanning(context: PhaseContext): Promise<QueryArchitectureResult> {
    const { jobId, topic, topicHash, filters, isDone } = context

    if (isDone("RESEARCH_PLANNING")) {
        return loadPhaseOutput<QueryArchitectureResult>(jobId, "RESEARCH_PLANNING")
    }

    await context.progress("RESEARCH_PLANNING", "Generating research plan...")
    await updatePhase(jobId, "RESEARCH_PLANNING", "RUNNING")
    await prisma.researchJob.update({
        where: { id: jobId },
        data: { currentStage: "planning" },
    })

    const negativeContexts = await prisma.reusableIdeaContext.findMany({
        where: { topicHash },
        orderBy: { qualitySignal: "desc" },
        take: 5,
        select: { problemLabel: true, whyDiscarded: true, userFeedback: true },
    })

    const cacheKey = createHash("sha256").update(`RESEARCH_PLAN:${topicHash}:${JSON.stringify(filters ?? {})}`).digest("hex")

    const aiJob = await enqueueAITask({
        jobId,
        task: "QUERY_ARCHITECTURE",
        payload: {
            topic,
            topicHash,
            filters,
            negativeContexts,
            targetQueryCount: 25,
        },
        cacheKey,
    })

    const result = (await aiJob.waitUntilFinished(aiQueueEvents, AI_CALL_TIMEOUT_MS)) as QueryArchitectureResult

    await updatePhase(jobId, "RESEARCH_PLANNING", "COMPLETED", {
        output: result,
        summary: `Generated ${result.queries.length} queries (negative context used: ${result.negativeContextUsed})`,
    })

    await context.phaseDone("RESEARCH_PLANNING", `${result.queries.length} queries ready`)

    return result
}