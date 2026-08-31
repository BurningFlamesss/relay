import { createModelRouter } from "#/core/research/model-router.ts"
import { z } from "zod"

const DrillDownQuerySchema = z.object({
    queries: z.array(z.object({
        query: z.string(),
        intentLabel: z.enum(["COMPLAINT", "WORKAROUND", "DEMAND", "COMPETITOR", "FAILURE_POST", "FEATURE_REQUEST"]),
        reasoning: z.string(),
        targetCluster: z.string(),
    })),
})

const DRILL_DOWN_SYSTEM_PROMPT = `You are Relay's Query Architect for iterative research. Given the top problem clusters from initial research, generate targeted drill-down queries to fill evidence gaps.

For each cluster, generate 3-5 specific queries that will:
1. Validate the problem strength with more evidence
2. Find specific examples/case studies
3. Identify competitors and their weaknesses
4. Quantify market size and willingness to pay
5. Understand technical implementation challenges

OUTPUT: JSON with "queries" array.`

export async function handleDrillDownQueries(payload: Record<string, unknown>, _job: {
    updateProgress: (value: unknown) => Promise<void>
}): Promise<{ queries: Array<{ query: string; intentLabel: string; reasoning: string; targetCluster: string }> }> {
    const router = createModelRouter()

    const clusters = (payload.clusters as Array<{
        clusterId: string
        label: string
        frequency: number
        intensityScore: number
        demandSignalCount: number
        evidenceChain: Array<{ url: string; quote: string; source: string; authorType: string; date: string | null }>
    }> | undefined) ?? []
    const previousQueries = (payload.previousQueries as Array<{ query: string; intentLabel: string }> | undefined) ?? []

    if (clusters.length === 0) {
        return { queries: [] }
    }

    const clusterText = clusters.map((c, i) =>
        `Cluster ${i + 1} (${c.clusterId}): ${c.label}
  Frequency: ${c.frequency} | Intensity: ${c.intensityScore.toFixed(2)} | Demand Signals: ${c.demandSignalCount}
  Evidence: ${c.evidenceChain.slice(0, 3).map(e => `"${e.quote.slice(0, 100)}" (${e.source})`).join("; ")}`
    ).join("\n\n")

    const previousText = previousQueries.map(q => `- ${q.query} [${q.intentLabel}]`).join("\n") || "None"

    const prompt = `Top Clusters to Investigate:
${clusterText}

Previous Queries (avoid duplicates):
${previousText}

Generate targeted drill-down queries as JSON.`

    const request = {
        messages: [
            { role: "system" as const, content: DRILL_DOWN_SYSTEM_PROMPT },
            { role: "user" as const, content: prompt },
        ],
        role: "planner" as const,
        temperature: 0.3,
        maxTokens: 4096,
        responseFormat: { type: "json_object" as const },
        task: "drill_down_queries",
    }

    try {
        const response = await router.complete(request, "planner")
        const parsed = JSON.parse(response.content)
        const validated = DrillDownQuerySchema.parse(parsed)
        return validated
    } catch (error) {
        console.error("[DRILL_DOWN] Failed:", error)
        return createFallbackDrillDown(clusters)
    }
}

function createFallbackDrillDown(clusters: Array<{ clusterId: string; label: string }>): { queries: Array<{ query: string; intentLabel: string; reasoning: string; targetCluster: string }> } {
    const queries: Array<{ query: string; intentLabel: string; reasoning: string; targetCluster: string }> = []

    for (const cluster of clusters.slice(0, 3)) {
        queries.push(
            { query: `${cluster.label} case study`, intentLabel: "DEMAND", reasoning: "Find concrete examples", targetCluster: cluster.clusterId },
            { query: `${cluster.label} alternatives competitors`, intentLabel: "COMPETITOR", reasoning: "Map competitive landscape", targetCluster: cluster.clusterId },
            { query: `${cluster.label} implementation challenges`, intentLabel: "WORKAROUND", reasoning: "Technical feasibility", targetCluster: cluster.clusterId },
        )
    }

    return { queries }
}