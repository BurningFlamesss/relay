import { aiQueueEvents, enqueueAITask } from "#/core/queues.ts";
import { AI_CALL_TIMEOUT_MS } from "#/core/types.ts";
import { serverEnv } from "#/env/server.ts";
import { prisma } from "#/db.ts";
import { publishProgress } from "#/core/redis.ts";
import type { PhaseContext } from "#/core/workers/orchestrator/context.ts";
import { loadResearchPhaseOutput, updateResearchPhase } from "../phase-tracker.ts";
import { createDocumentNormalizer } from "#/core/research/orchestration/normalizer.ts";
import { createEvidenceExtractor } from "#/core/research/orchestration/evidence-extractor.ts";

// Bound how many documents a single job extracts so large crawls stay responsive
// and a job fits within a free-tier OpenRouter request budget (~50/day/key).
const MAX_EXTRACTION_DOCS = serverEnv.RESEARCH_MAX_EXTRACTION_DOCS

export async function runResearchExtraction(context: PhaseContext): Promise<void> {
    const { jobId, isDone } = context

    if (isDone("RESEARCH_EXTRACTION")) {
        return
    }

    await context.progress("RESEARCH_EXTRACTION", "Normalizing documents and extracting evidence...")
    await updateResearchPhase(jobId, "RESEARCH_EXTRACTION", "RUNNING")
    await prisma.researchJob.update({
        where: { id: jobId },
        data: { currentStage: "extracting" },
    })

    const normalizer = createDocumentNormalizer()
    const extractor = createEvidenceExtractor()

    const candidates = await prisma.researchDocument.findMany({
        where: { jobId, status: "PENDING" },
        include: { source: true },
        // Prefer content-rich documents (e.g. dev.to / arXiv / Stack Overflow)
        // over near-empty API/RSS entries, then scan a wider set than the LLM
        // budget so short docs don't consume it. Only MAX_EXTRACTION_DOCS *valid*
        // documents are actually extracted below.
        orderBy: [{ wordCount: "desc" }, { crawledAt: "asc" }],
        take: MAX_EXTRACTION_DOCS * 3,
    })

    if (candidates.length === 0) {
        await updateResearchPhase(jobId, "RESEARCH_EXTRACTION", "SKIPPED", {
            summary: "No pending documents to process",
        })
        return
    }

    // Load the plan once rather than re-querying it for every document.
    const job = await prisma.researchJob.findUnique({
        where: { id: jobId },
        select: { plan: true },
    })
    const plan = job?.plan

    let processedCount = 0
    let evidenceCount = 0

    for (const doc of candidates) {
        if (processedCount >= MAX_EXTRACTION_DOCS) break

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

        // Reuse the job-scoped identity assigned at crawl time. The contentHash
        // written during crawling (content + url + jobId) is the value the unique
        // constraint is built around, so we must NOT overwrite it here with the
        // normalizer's non-scoped hash - doing so collides across research jobs.
        normalized.id = doc.id

        await prisma.researchDocument.update({
            where: { id: doc.id },
            data: {
                content: normalized.content,
                markdown: normalized.markdown,
                headings: normalized.headings,
                wordCount: normalized.wordCount,
                metadata: normalized.metadata as any,
                status: "COMPLETED",
            },
        })

        if (plan) {
            const evidence = await extractor.extractEvidence(normalized, plan as any)
            for (const ev of evidence) {
                await prisma.evidence.upsert({
                    where: { id: ev.id },
                    create: {
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
                    update: {
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

        await publishProgress({
            type: "EVIDENCE_EXTRACTED",
            jobId,
            url: doc.url,
            message: `Extracted evidence from ${doc.domain || doc.url}`,
            signalCount: processedCount,
            timestamp: Date.now(),
            metadata: {
                domain: doc.domain,
                title: doc.title,
                evidenceCount,
            },
        })
    }

    await updateResearchPhase(jobId, "RESEARCH_EXTRACTION", "COMPLETED", {
        summary: `Processed ${processedCount} documents, extracted ${evidenceCount} evidence items`,
    })

    await context.phaseDone("RESEARCH_EXTRACTION", `${processedCount} docs, ${evidenceCount} evidence`)
}