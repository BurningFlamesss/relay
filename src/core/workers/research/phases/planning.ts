import { aiQueueEvents, enqueueAITask } from "#/core/queues.ts";
import { AI_CALL_TIMEOUT_MS } from "#/core/types.ts";
import type { QueryArchitectureResult } from "#/core/types.ts";
import type { ResearchPlan, SourceCategory, ResearchDepth } from "#/core/research/types.ts";
import { prisma } from "#/db.ts";
import { createHash } from "node:crypto";
import type { PhaseContext } from "#/core/workers/orchestrator/context.ts";
import { loadResearchPhaseOutput, updateResearchPhase } from "../phase-tracker.ts";

function mapQueryArchitectureToResearchPlan(result: QueryArchitectureResult, topic: string, depth: ResearchDepth): ResearchPlan {
    const subQuestions = result.queries.slice(0, 5).map(q => q.query)
    const sourceCategories = [...new Set(result.queries.flatMap(q => {
        const intent = q.intentLabel
        if (intent === "COMPLAINT" || intent === "WORKAROUND") return ["TECHNICAL", "COMMUNITY"]
        if (intent === "DEMAND" || intent === "FEATURE_REQUEST") return ["TECHNICAL", "RESEARCH"]
        if (intent === "COMPETITOR") return ["COMPANY", "FINANCIAL"]
        if (intent === "FAILURE_POST") return ["TECHNICAL", "COMMUNITY"]
        return ["TECHNICAL", "RESEARCH"]
    }))] as SourceCategory[]

    return {
        question: topic,
        intent: result.queries[0]?.reasoning ?? "Research investigation",
        subQuestions,
        searchQueries: result.queries.map(q => ({
            query: q.query,
            intent: q.intentLabel.toLowerCase() as any,
            priority: 5,
            expectedSourceTypes: [],
        })),
        sourceCategories,
        preferredSources: [],
        freshnessRequirement: "recent",
        depth,
        estimatedSources: 30,
        estimatedIterations: 3,
    }
}

export async function runResearchPlanning(context: PhaseContext): Promise<ResearchPlan> {
    const { jobId, topic, topicHash, filters, isDone } = context

    if (isDone("RESEARCH_PLANNING")) {
        return loadResearchPhaseOutput<ResearchPlan>(jobId, "RESEARCH_PLANNING")
    }

    await context.progress("RESEARCH_PLANNING", "Generating research plan...")
    await updateResearchPhase(jobId, "RESEARCH_PLANNING", "RUNNING")
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

    // Convert QueryArchitectureResult to ResearchPlan
    const job = await prisma.researchJob.findUnique({ where: { id: jobId }, select: { depth: true } })
    const depth = job?.depth ?? "STANDARD"
    const researchPlan = mapQueryArchitectureToResearchPlan(result, topic, depth)

    // Save the plan to the research job
    await prisma.researchJob.update({
        where: { id: jobId },
        data: { plan: researchPlan as any },
    })

    await updateResearchPhase(jobId, "RESEARCH_PLANNING", "COMPLETED", {
        output: researchPlan,
        summary: `Generated ${result.queries.length} queries (negative context used: ${result.negativeContextUsed})`,
    })

    await context.phaseDone("RESEARCH_PLANNING", `${result.queries.length} queries ready`)

    return researchPlan
}