import type { AIJobData, AITaskType } from "#/core/types.ts";
import { UnrecoverableError, type Job } from "bullmq";
import { getCached, setCache } from "./cache";
import { acquireRateLimit } from "./rate-limiter";
import { handleQueryArchitecture } from "./tasks/query-architecture";
import { handleDrillDownQueries } from "./tasks/drill-down-queries";
import { handleClusteringLabelling } from "./tasks/cluster-labelling";
import { handleWhyNow } from "./tasks/why-now";
import { handleCompetitorAnalysis } from "./tasks/competitor-analysis";
import { handleSynthesis } from "./tasks/synthesis";

export async function processAIJob(job: Job<AIJobData>): Promise<unknown> {
    const { task, payload, cacheKey } = job.data

    const cached = await getCached(cacheKey)

    if (cached) {
        await job.updateProgress({
            task,
            cached: true,
            message: "Cache hit - skipping API call"
        })
        return cached
    }

    await acquireRateLimit(task)
    await job.updateProgress({
        task, message: `Calling AI for ${task}...`
    })

    const handlers: Record<AITaskType, (payload: Record<string, unknown>, _job: typeof job) => Promise<unknown>> = {
        QUERY_ARCHITECTURE: handleQueryArchitecture,
        DRILL_DOWN_QUERIES: handleDrillDownQueries,
        CLUSTER_LABELING: handleClusteringLabelling,
        WHY_NOW: handleWhyNow,
        COMPETITOR_ANALYSIS: handleCompetitorAnalysis,
        SYNTHESIS: handleSynthesis
    }

    const handler = handlers[task]

    if (!handler) {
        throw new UnrecoverableError(`Unknown AI task: ${task}`)
    }

    const result = await handler(payload, job)

    await setCache(cacheKey, result)

    return result
}