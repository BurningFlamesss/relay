import { aiQueueEvents, enqueueAITask } from "#/core/queues.ts";
import { AI_CALL_TIMEOUT_MS } from "#/core/types.ts";
import { prisma } from "#/db.ts";
import { publishProgress } from "#/core/redis.ts";
import { createHash } from "node:crypto";
import type { PhaseContext } from "#/core/workers/orchestrator/context.ts";
import { updateResearchPhase } from "../phase-tracker.ts";
import { discoverSources, mapPrismaSource } from "#/core/research/source-registry.ts";
import type { ResearchPlan, SearchQuery } from "#/core/research/types.ts";

export async function runResearchDiscovery(context: PhaseContext, plan: ResearchPlan): Promise<void> {
    const { jobId, isDone } = context

    if (isDone("RESEARCH_DISCOVERY")) {
        return
    }

    await context.progress("RESEARCH_DISCOVERY", "Discovering relevant sources...")
    await updateResearchPhase(jobId, "RESEARCH_DISCOVERY", "RUNNING")
    await prisma.researchJob.update({
        where: { id: jobId },
        data: { currentStage: "discovering" },
    })

    console.log(`[DISCOVERY] Starting discovery for job ${jobId}`)
    console.log(`[DISCOVERY] Plan queries: ${plan.searchQueries.length}`)

    const discovery = await discoverSources({
        searchQueries: plan.searchQueries.map(q => ({
            query: q.query,
            expectedSourceTypes: q.expectedSourceTypes,
        })),
    }, {
        maxSources: 30,
        minAuthorityScore: 0,
    })

    console.log(`[DISCOVERY] Discovery result: ${discovery.sources.length} sources from ${discovery.totalCandidates} candidates`)

    const sources = discovery.sources.map(mapPrismaSource)

    console.log(`[DISCOVERY] Mapped ${sources.length} sources for job ${jobId}`)

    // Create job-specific source records (copy from global sources)
    for (const source of sources) {
        const jobSourceId = `${source.id}-${jobId.slice(0, 8)}`
        
        await prisma.researchSource.upsert({
            where: { id: jobSourceId },
            create: {
                id: jobSourceId,
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
            update: {
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

        await publishProgress({
            type: "SOURCE_DISCOVERED",
            jobId,
            url: source.url,
            message: `Found source: ${source.domain}`,
            timestamp: Date.now(),
            metadata: {
                name: source.name,
                domain: source.domain,
                category: source.category,
                sourceType: source.sourceType,
            },
        })
    }

    await updateResearchPhase(jobId, "RESEARCH_DISCOVERY", "COMPLETED", {
        summary: `Discovered ${sources.length} sources from ${discovery.totalCandidates} candidates (${discovery.duplicateCount} duplicates filtered)`,
    })

    await context.phaseDone("RESEARCH_DISCOVERY", `${sources.length} sources selected`)
}