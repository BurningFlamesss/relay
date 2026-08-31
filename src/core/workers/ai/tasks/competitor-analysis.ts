import { createModelRouter } from "#/core/research/model-router.ts"
import { z } from "zod"

const CompetitorSchema = z.object({
    name: z.string(),
    description: z.string(),
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    pricing: z.string().optional(),
    targetMarket: z.string().optional(),
    fundingStage: z.string().optional(),
    evidence: z.array(z.object({
        quote: z.string(),
        source: z.string(),
    })),
})

const CompetitorAnalysisSchema = z.object({
    competitors: z.array(CompetitorSchema),
    marketGaps: z.array(z.string()),
    deadCompetitors: z.array(z.object({
        name: z.string(),
        reason: z.string(),
        lesson: z.string(),
    })),
})

const COMPETITOR_SYSTEM_PROMPT = `You are Relay's Competitive Analyst. Map the competitive landscape for the given problem.

Identify:
1. Direct competitors (solving same problem)
2. Indirect competitors (alternative solutions)
3. Their strengths, weaknesses, pricing, target markets
4. Market gaps / unmet needs
5. Dead competitors and why they failed (critical for avoiding same mistakes)

Use ONLY the provided evidence. Do not invent competitors.

OUTPUT: JSON matching CompetitorAnalysisSchema exactly.`

export async function handleCompetitorAnalysis(payload: Record<string, unknown>, _job: {
    updateProgress: (value: unknown) => Promise<void>
}): Promise<{ competitors: Array<{ name: string; description: string; strengths: string[]; weaknesses: string[]; pricing?: string; targetMarket?: string; fundingStage?: string; evidence: Array<{ quote: string; source: string }> }>; marketGaps: string[]; deadCompetitors: Array<{ name: string; reason: string; lesson: string }> }> {
    const router = createModelRouter()

    const problemLabel = (payload.problemLabel as string | undefined) ?? ""
    const evidenceQuotes = (payload.evidenceQuotes as Array<{ quote: string; source: string; intentLabel: string }> | undefined) ?? []

    const evidenceText = evidenceQuotes.map((e, i) =>
        `[${i}] ${e.source} [${e.intentLabel}]: ${e.quote}`
    ).join("\n\n") || "No evidence provided"

    const prompt = `Problem: ${problemLabel}

Evidence:
${evidenceText}

Analyze the competitive landscape. Output as JSON.`

    const request = {
        messages: [
            { role: "system" as const, content: COMPETITOR_SYSTEM_PROMPT },
            { role: "user" as const, content: prompt },
        ],
        role: "researcher" as const,
        temperature: 0.2,
        maxTokens: 4096,
        responseFormat: { type: "json_object" as const },
        task: "competitor_analysis",
    }

    try {
        const response = await router.complete(request, "researcher")
        const parsed = JSON.parse(response.content)
        const validated = CompetitorAnalysisSchema.parse(parsed)
        return validated
    } catch (error) {
        console.error("[COMPETITOR_ANALYSIS] Failed:", error)
        return {
            competitors: [],
            marketGaps: ["Insufficient evidence for competitive analysis"],
            deadCompetitors: [],
        }
    }
}