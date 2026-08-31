import { AI_CALL_TIMEOUT_MS, type QueryArchitectureResult } from "#/core/types.ts";
import { prisma } from "#/db.ts";
import { createHash } from "node:crypto";
import type { PhaseContext } from "../context";
import { loadPhaseOutput, updatePhase } from "../phase-tracker";
import { aiQueueEvents, enqueueAITask } from "#/core/queues.ts";

export async function runQueryArchitecture(context: PhaseContext): Promise<QueryArchitectureResult> {
    const { jobId, topic, topicHash, filters, isDone } = context

    if (isDone("QUERY_ARCHITECTURE")) {
        return loadPhaseOutput<QueryArchitectureResult>(jobId, "QUERY_ARCHITECTURE")
    }

    await context.progress("QUERY_ARCHITECTURE", "Generating search queries...")
    await updatePhase(jobId, "QUERY_ARCHITECTURE", "RUNNING")
    await prisma.analysisJob.update({
        where: {
            id: jobId
        },
        data: {
            currentPhase: "QUERY_ARCHITECTURE"
        }
    })

    const negativeContexts = await prisma.reusableIdeaContext.findMany({
        where: {
            topicHash
        },
        orderBy: {
            qualitySignal: "desc"
        },
        take: 5,
        select: {
            problemLabel: true,
            whyDiscarded: true,
            userFeedback: true
        }
    })


    const cacheKey = createHash("sha256").update(`QUERY_ARCH:${topicHash}:${JSON.stringify(filters ?? {})}`).digest("hex")

    const aiJob = await enqueueAITask({
        jobId,
        task: "QUERY_ARCHITECTURE",
        payload: {
            topic,
            topicHash,
            filters,
            negativeContexts,
            targetQueryCount: 25
        },
        cacheKey
    })

    const result = (await aiJob.waitUntilFinished(aiQueueEvents, AI_CALL_TIMEOUT_MS)) as QueryArchitectureResult

    await updatePhase(jobId, "QUERY_ARCHITECTURE", "COMPLETED", {
        output: result,
        summary: `Generated ${result.queries.length} queries (negative context used: ${result.negativeContextUsed})`
    })

    await context.phaseDone("QUERY_ARCHITECTURE", `${result.queries.length} queries ready`)

    return result
}