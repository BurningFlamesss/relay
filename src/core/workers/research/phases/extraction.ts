import { aiQueueEvents, enqueueAITask } from "#/core/queues.ts";
import { AI_CALL_TIMEOUT_MS } from "#/core/types.ts";
import { prisma } from "#/db.ts";
import type { PhaseContext } from "#/core/workers/orchestrator/context.ts";
import { loadPhaseOutput, updatePhase } from "#/core/workers/orchestrator/phase-tracker.ts";
import { createDocumentNormalizer } from "#/core/research/orchestration/normalizer.ts";
import { createEvidenceExtractor } from "#/core/research/orchestration/evidence-extractor.ts";

export async function runResearchExtraction(context: PhaseContext): Promise<void> {
    const { jobId, isDone } = context

    if (isDone("RESEARCH_EXTRACTION")) {
        return
    }

    await context.progress("RESEARCH_EXTRACTION", "Normalizing documents and extracting evidence...")
    await updatePhase(jobId, "RESEARCH_EXTRACTION", "RUNNING")
    await prisma.researchJob.update({
        where: { id: jobId },
        data: { currentStage: "extracting" },
    })

    const normalizer = createDocumentNormalizer()
    const extractor = createEvidenceExtractor()

    const documents = await prisma.researchDocument.findMany({
        where: { jobId, status: "PENDING" },
        include: { source: true },
    })

    if (documents.length === 0) {
        await updatePhase(jobId, "RESEARCH_EXTRACTION", "SKIPPED", {
            summary: "No pending documents to process",
        })
        return
    }

    let processedCount = 0
    let evidenceCount = 0

    for (const doc of documents) {
        const normalized = normalizer.normalize({
            url: doc.url,
            success: true,
            title: doc.title ?? undefined,
            description: doc.description ?? undefined,
            markdown: doc.markdown ?? undefined,
            html: undefined,
            text: doc.content,
            headings: doc.headings,
            links: [],
            media: [],
            metadata: doc.metadata as Record<string, unknown>,
            author: doc.author ?? undefined,
            publishedAt: doc.publishedAt?.toISOString(),
            language: doc.language ?? undefined,
            wordCount: doc.wordCount,
        }, doc.sourceId ?? undefined)

        if (!normalizer.isValid(normalized)) {
            await prisma.researchDocument.update({
                where: { id: doc.id },
                data: { status: "FAILED", errorMessage: "Document too short or empty" },
            })
            continue
        }

        await prisma.researchDocument.update({
            where: { id: doc.id },
            data: {
                content: normalized.content,
                markdown: normalized.markdown,
                headings: normalized.headings,
                wordCount: normalized.wordCount,
                contentHash: normalized.contentHash,
                metadata: normalized.metadata as any,
                status: "COMPLETED",
            },
        })

        const plan = await prisma.researchJob.findUnique({
            where: { id: jobId },
            select: { plan: true },
        })

        if (plan?.plan) {
            const evidence = await extractor.extractEvidence(normalized, plan.plan as any)
            for (const ev of evidence) {
                await prisma.evidence.create({
                    data: {
                        id: ev.id,
                        jobId,
                        documentId: doc.id,
                        claim: ev.claim,
                        supportingText: ev.supportingText,
                        evidenceType: ev.evidenceType,
                        relevance: ev.relevance,
                        confidence: ev.confidence,
                        location: ev.location,
                        startOffset: ev.startOffset,
                        endOffset: ev.endOffset,
                    },
                })
                evidenceCount++
            }
        }

        processedCount++
    }

    await updatePhase(jobId, "RESEARCH_EXTRACTION", "COMPLETED", {
        summary: `Processed ${processedCount} documents, extracted ${evidenceCount} evidence items`,
    })

    await context.phaseDone("RESEARCH_EXTRACTION", `${processedCount} docs, ${evidenceCount} evidence`)
}