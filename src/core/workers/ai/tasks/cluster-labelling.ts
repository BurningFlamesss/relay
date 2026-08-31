import { createModelRouter } from "#/core/research/model-router.ts"
import type { ClusterLabelingResult } from "#/core/types.ts"
import { z } from "zod"

const ClusterSchema = z.object({
    clusterId: z.string(),
    label: z.string(),
    personaSketches: z.array(z.object({
        authorType: z.enum(["DEVELOPER", "BUSINESS_OWNER", "CONSUMER", "STUDENT", "UNKNOWN"]),
        description: z.string(),
    })),
    failedWorkarounds: z.array(z.string()),
    evidenceChain: z.array(z.object({
        url: z.string(),
        quote: z.string(),
        source: z.enum(["REDDIT", "HACKER_NEWS", "G2", "CAPTERRA", "TRUSTPILOT", "GITHUB_ISSUES", "STACK_OVERFLOW", "DEV_TO", "HASHNODE", "LINKEDIN_JOBS", "PRODUCT_HUNT", "APP_STORE"]),
        authorType: z.enum(["DEVELOPER", "BUSINESS_OWNER", "CONSUMER", "STUDENT", "UNKNOWN"]),
        date: z.string().nullable(),
    })),
    demandSignalCount: z.number(),
    compositeScore: z.number(),
})

const ClusteringSchema = z.object({
    clusters: z.array(ClusterSchema),
})

const CLUSTERING_SYSTEM_PROMPT = `You are Relay's Problem Clusterer. Group signals into coherent problem clusters and label them.

Given a set of signals (quotes from sources with metadata), you must:
1. Group semantically similar signals into clusters
2. Label each cluster with a clear problem statement
3. Identify persona sketches (who is affected)
4. Extract failed workarounds mentioned
5. Build evidence chains linking signals to the cluster
6. Count demand signals per cluster
7. Assign composite score (0-1) based on frequency, intensity, demand

OUTPUT: JSON with "clusters" array matching ClusterSchema exactly.`

export async function handleClusteringLabelling(payload: Record<string, unknown>, _job: {
    updateProgress: (value: unknown) => Promise<void>
}): Promise<ClusterLabelingResult> {
    const router = createModelRouter()

    const signals = (payload.signals as Array<{
        id: string
        quote: string
        source: string
        authorType: string
        intentLabel: string
        intensityScore: number | null
        isDemandSignal: boolean
        publishedAt: string | null
        url: string
        clusterId: string | null
    }> | undefined) ?? []
    const topN = typeof payload.topN === "number" ? payload.topN : 5

    if (signals.length === 0) {
        return { clusters: [] }
    }

    const signalText = signals.map((s, i) =>
        `[${i}] Cluster: ${s.clusterId ?? "unclustered"} | Source: ${s.source} | Author: ${s.authorType} | Intent: ${s.intentLabel} | Intensity: ${s.intensityScore?.toFixed(2) ?? "N/A"} | Demand: ${s.isDemandSignal}\n    Quote: ${s.quote}\n    URL: ${s.url}\n    Date: ${s.publishedAt ?? "unknown"}`
    ).join("\n\n")

    const prompt = `Signals to cluster (${signals.length} total):
${signalText}

Create ${topN} problem clusters as JSON.`

    const request = {
        messages: [
            { role: "system" as const, content: CLUSTERING_SYSTEM_PROMPT },
            { role: "user" as const, content: prompt },
        ],
        role: "researcher" as const,
        temperature: 0.3,
        maxTokens: 8192,
        responseFormat: { type: "json_object" as const },
        task: "clustering",
    }

    try {
        const response = await router.complete(request, "researcher")
        const parsed = JSON.parse(response.content)
        const validated = ClusteringSchema.parse(parsed)

        return { clusters: validated.clusters }
    } catch (error) {
        console.error("[CLUSTERING] Failed to cluster:", error)
        return createFallbackClustering(signals, topN)
    }
}

function createFallbackClustering(signals: Array<{ clusterId: string | null; quote: string; source: string; authorType: string; intentLabel: string; intensityScore: number | null; isDemandSignal: boolean; publishedAt: string | null; url: string }>, topN: number): ClusterLabelingResult {
    const clusters = new Map<string, typeof signals>()

    for (const signal of signals) {
        const key = signal.clusterId ?? "unclustered"
        if (!clusters.has(key)) clusters.set(key, [])
        clusters.get(key)!.push(signal)
    }

    const clusterEntries = Array.from(clusters.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, topN)

    return {
        clusters: clusterEntries.map(([clusterId, clusterSignals], i) => ({
            clusterId: clusterId === "unclustered" ? `cluster-${i}` : clusterId,
            label: `Problem Cluster ${i + 1} (${clusterSignals.length} signals)`,
            personaSketches: [{ authorType: "UNKNOWN" as const, description: "Mixed audience" }],
            failedWorkarounds: [],
            evidenceChain: clusterSignals.slice(0, 5).map(s => ({
                url: s.url,
                quote: s.quote.slice(0, 200),
                source: s.source as any,
                authorType: s.authorType as any,
                date: s.publishedAt,
            })),
            demandSignalCount: clusterSignals.filter(s => s.isDemandSignal).length,
            compositeScore: 0.5,
        })),
    }
}