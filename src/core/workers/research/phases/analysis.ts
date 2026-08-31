import { aiQueueEvents, enqueueAITask } from "#/core/queues.ts";
import { AI_CALL_TIMEOUT_MS } from "#/core/types.ts";
import { prisma } from "#/db.ts";
import type { PhaseContext } from "#/core/workers/orchestrator/context.ts";
import { loadPhaseOutput, updatePhase } from "#/core/workers/orchestrator/phase-tracker.ts";

export async function runResearchAnalysis(context: PhaseContext): Promise<void> {
    const { jobId, isDone } = context

    if (isDone("RESEARCH_ANALYSIS")) {
        return
    }

    await context.progress("RESEARCH_ANALYSIS", "Analyzing evidence and identifying gaps...")
    await updatePhase(jobId, "RESEARCH_ANALYSIS", "RUNNING")
    await prisma.researchJob.update({
        where: { id: jobId },
        data: { currentStage: "analyzing" },
    })

    const evidence = await prisma.evidence.findMany({
        where: { jobId },
        include: { document: true },
        orderBy: { relevance: "desc" },
    })

    const plan = await prisma.researchJob.findUnique({
        where: { id: jobId },
        select: { plan: true },
    })

    if (!plan?.plan || evidence.length === 0) {
        await updatePhase(jobId, "RESEARCH_ANALYSIS", "SKIPPED", {
            summary: "No evidence or plan to analyze",
        })
        return
    }

    const cacheKey = `research-analysis:${jobId}:${evidence.length}`

    const aiJob = await enqueueAITask({
        jobId,
        task: "SYNTHESIS", // Reusing synthesis task for analysis
        payload: {
            problemLabel: (plan.plan as any).question,
            problemSummary: (plan.plan as any).intent,
            targetPersona: "Researcher",
            competitorMap: {},
            featureGaps: {},
            deadCompetitors: {},
            communitySize: {},
            jobPostingVolume: 0,
            fundingSignals: {},
            whyNow: "",
            trendDirection: "",
            scoringBreakdown: {},
            evidenceQuotes: evidence.slice(0, 50).map(e => ({
                quote: e.supportingText,
                source: e.document.domain,
                intentLabel: e.evidenceType,
            })),
            instruction: "Analyze evidence for gaps, conflicts, and key findings. Identify what sub-questions are well-supported vs need more evidence.",
        },
        cacheKey,
    })

    const result = await aiJob.waitUntilFinished(aiQueueEvents, AI_CALL_TIMEOUT_MS * 2)

    await updatePhase(jobId, "RESEARCH_ANALYSIS", "COMPLETED", {
        output: result,
        summary: `Analyzed ${evidence.length} evidence items`,
    })

    await context.phaseDone("RESEARCH_ANALYSIS", `Analyzed ${evidence.length} evidence items`)
}