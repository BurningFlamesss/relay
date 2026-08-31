import { aiQueueEvents, enqueueAITask } from "#/core/queues.ts";
import { AI_CALL_TIMEOUT_MS } from "#/core/types.ts";
import { prisma } from "#/db.ts";
import { createHash } from "node:crypto";
import type { PhaseContext } from "#/core/workers/orchestrator/context.ts";
import { loadPhaseOutput, updatePhase } from "#/core/workers/orchestrator/phase-tracker.ts";
import { discoverSources, mapPrismaSource } from "#/core/research/source-registry.ts";
import type { ResearchPlan, QueryArchitectureResult } from "#/core/research/types.ts";

export async function runResearchDiscovery(context: PhaseContext, plan: QueryArchitectureResult): Promise<void> {
    const { jobId, isDone } = context

    if (isDone("RESEARCH_DISCOVERY")) {
        return
    }

    await context.progress("RESEARCH_DISCOVERY", "Discovering relevant sources...")
    await updatePhase(jobId, "RESEARCH_DISCOVERY", "RUNNING")
    await prisma.researchJob.update({
        where: { id: jobId },
        data: { currentStage: "discovering" },
    })

    const discovery = await discoverSources({
        searchQueries: plan.queries.map(q => ({
            query: q.query,
            expectedSourceTypes: [], // Will be inferred from intent
        })),
    }, {
        maxSources: 30,
        minAuthorityScore: 0,
    })

    const sources = discovery.sources.map(mapPrismaSource)

    for (const source of sources) {
        await prisma.researchSource.upsert({
            where: { id: source.id },
            update: {
                jobId,
                name: source.name,
                domain: source.domain,
                url: source.url,
                category: source.category,
                priority: source.priority,
                sourceType: source.sourceType,
                enabled: source.enabled,
                crawlPolicy: source.crawlPolicy as any,
                relevanceScore: source.relevanceScore,
                authorityScore: source.authorityScore,
                freshnessScore: source.freshnessScore,
            },
            create: {
                id: source.id,
                jobId,
                name: source.name,
                domain: source.domain,
                url: source.url,
                category: source.category,
                priority: source.priority,
                sourceType: source.sourceType,
                enabled: source.enabled,
                crawlPolicy: source.crawlPolicy as any,
                relevanceScore: source.relevanceScore,
                authorityScore: source.authorityScore,
                freshnessScore: source.freshnessScore,
            },
        })
    }

    await updatePhase(jobId, "RESEARCH_DISCOVERY", "COMPLETED", {
        summary: `Discovered ${sources.length} sources from ${discovery.totalCandidates} candidates (${discovery.duplicateCount} duplicates filtered)`,
    })

    await context.phaseDone("RESEARCH_DISCOVERY", `${sources.length} sources selected`)
}