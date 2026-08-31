import { aiQueueEvents, enqueueAITask } from "#/core/queues.ts";
import { AI_CALL_TIMEOUT_MS } from "#/core/types.ts";
import { prisma } from "#/db.ts";
import type { PhaseContext } from "#/core/workers/orchestrator/context.ts";
import { updatePhase } from "#/core/workers/orchestrator/phase-tracker.ts";
import { createResearchSynthesizer } from "#/core/research/orchestration/synthesizer.ts";
import { createCitationResolver } from "#/core/research/orchestration/citation-resolver.ts";

export async function runResearchSynthesis(context: PhaseContext): Promise<void> {
    const { jobId, isDone, userId } = context

    if (isDone("RESEARCH_SYNTHESIS")) {
        return
    }

    await context.progress("RESEARCH_SYNTHESIS", "Synthesizing final research report...")
    await updatePhase(jobId, "RESEARCH_SYNTHESIS", "RUNNING")
    await prisma.researchJob.update({
        where: { id: jobId },
        data: { currentStage: "synthesizing" },
    })

    const job = await prisma.researchJob.findUnique({
        where: { id: jobId },
        include: {
            plan: true,
            documents: true,
            evidence: { include: { document: true } },
            sources: true,
        },
    })

    if (!job?.plan || !job.documents.length || !job.evidence.length) {
        await updatePhase(jobId, "RESEARCH_SYNTHESIS", "FAILED", {
            errorMessage: "Missing plan, documents, or evidence for synthesis",
        })
        throw new Error("Insufficient data for synthesis")
    }

    const synthesizer = createResearchSynthesizer()
    const citationResolver = createCitationResolver()

    const plan = job.plan as any

    const sourceRefs = await citationResolver.getSourceReferences(jobId)

    const report = await synthesizer.synthesize(
        plan,
        job.documents as any,
        job.evidence as any,
        sourceRefs
    )

    const citations = await citationResolver.resolveCitations(job.evidence as any, job.documents as any)
    await citationResolver.persistCitations(jobId, citations)

    await prisma.researchReport.upsert({
        where: { jobId },
        update: {
            title: report.title,
            executiveSummary: report.executiveSummary,
            keyFindings: report.keyFindings as any,
            detailedAnalysis: report.detailedAnalysis as any,
            disagreements: report.disagreements as any,
            limitations: report.limitations,
            conclusion: report.conclusion,
            sources: report.sources as any,
            wordCount: report.wordCount,
            readingTimeMinutes: report.readingTimeMinutes,
        },
        create: {
            id: report.id,
            jobId,
            title: report.title,
            executiveSummary: report.executiveSummary,
            keyFindings: report.keyFindings as any,
            detailedAnalysis: report.detailedAnalysis as any,
            disagreements: report.disagreements as any,
            limitations: report.limitations,
            conclusion: report.conclusion,
            sources: report.sources as any,
            wordCount: report.wordCount,
            readingTimeMinutes: report.readingTimeMinutes,
        },
    })

    await prisma.researchJob.update({
        where: { id: jobId },
        data: {
            status: "COMPLETED",
            completedAt: new Date(),
            currentStage: "completed",
        },
    })

    await updatePhase(jobId, "RESEARCH_SYNTHESIS", "COMPLETED", {
        summary: `Report generated: ${report.wordCount} words, ${report.keyFindings.length} findings`,
    })

    await context.phaseDone("RESEARCH_SYNTHESIS", "Research report complete")
}