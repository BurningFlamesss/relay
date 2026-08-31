import { createModelRouter } from "#/core/research/model-router.ts"
import { z } from "zod"

const WhyNowSchema = z.object({
    whyNow: z.string(),
    timingSignals: z.array(z.object({
        signal: z.string(),
        source: z.string(),
        strength: z.enum(["weak", "moderate", "strong"]),
    })),
    urgencyScore: z.number().min(0).max(1),
})

const WHY_NOW_SYSTEM_PROMPT = `You are Relay's Timing Analyst. Analyze why now is the right time for a solution to the given problem.

Evaluate timing signals including:
- Technology maturity / infrastructure readiness
- Market shifts / regulatory changes
- Competitor movements / funding activity
- User behavior shifts / adoption curves
- Cost reductions / enabling technologies

OUTPUT: JSON with "whyNow" (narrative), "timingSignals" (array), "urgencyScore" (0-1).`

export async function handleWhyNow(payload: Record<string, unknown>, _job: {
    updateProgress: (value: unknown) => Promise<void>
}): Promise<{ whyNow: string; timingSignals: Array<{ signal: string; source: string; strength: "weak" | "moderate" | "strong" }>; urgencyScore: number }> {
    const router = createModelRouter()

    const problemLabel = (payload.problemLabel as string | undefined) ?? ""
    const problemSummary = (payload.problemSummary as string | undefined) ?? ""
    const trendDirection = (payload.trendDirection as string | undefined) ?? ""
    const fundingSignals = (payload.fundingSignals as Record<string, unknown> | undefined) ?? {}
    const jobPostingVolume = typeof payload.jobPostingVolume === "number" ? payload.jobPostingVolume : 0
    const communitySize = (payload.communitySize as Record<string, unknown> | undefined) ?? {}
    const evidenceQuotes = (payload.evidenceQuotes as Array<{ quote: string; source: string; intentLabel: string }> | undefined) ?? []

    const evidenceText = evidenceQuotes.slice(0, 20).map((e, i) =>
        `[${i}] ${e.source} [${e.intentLabel}]: ${e.quote.slice(0, 200)}`
    ).join("\n") || "No evidence provided"

    const prompt = `Problem: ${problemLabel}
Summary: ${problemSummary}
Trend Direction: ${trendDirection}
Funding Signals: ${JSON.stringify(fundingSignals)}
Job Posting Volume: ${jobPostingVolume}
Community Size: ${JSON.stringify(communitySize)}

Evidence:
${evidenceText}

Analyze why now is the right time. Output as JSON.`

    const request = {
        messages: [
            { role: "system" as const, content: WHY_NOW_SYSTEM_PROMPT },
            { role: "user" as const, content: prompt },
        ],
        role: "researcher" as const,
        temperature: 0.3,
        maxTokens: 4096,
        responseFormat: { type: "json_object" as const },
        task: "why_now",
    }

    try {
        const response = await router.complete(request, "researcher")
        const parsed = JSON.parse(response.content)
        const validated = WhyNowSchema.parse(parsed)
        return validated
    } catch (error) {
        console.error("[WHY_NOW] Failed:", error)
        return {
            whyNow: "Timing analysis requires more evidence",
            timingSignals: [],
            urgencyScore: 0.5,
        }
    }
}