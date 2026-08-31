import { createModelRouter } from "#/core/research/model-router.ts"
import type { SynthesisResult } from "#/core/types.ts"
import { z } from "zod"

const FindingSchema = z.object({
    claim: z.string().min(10),
    explanation: z.string().min(20),
    evidenceIds: z.array(z.string()),
    confidence: z.enum(["high", "medium", "low"]),
    category: z.string().optional(),
})

const DisagreementSchema = z.object({
    topic: z.string(),
    positions: z.array(z.object({
        claim: z.string(),
        evidenceIds: z.array(z.string()),
        sourceCount: z.number(),
        confidence: z.enum(["high", "medium", "low"]),
    })),
    resolution: z.string().optional(),
})

const SectionSchema = z.object({
    heading: z.string(),
    content: z.string(),
    evidenceIds: z.array(z.string()),
    subSections: z.array(z.object({
        heading: z.string(),
        content: z.string(),
        evidenceIds: z.array(z.string()),
    })).optional(),
})

const SynthesisSchema = z.object({
    title: z.string(),
    executiveSummary: z.string().min(50),
    keyFindings: z.array(FindingSchema),
    detailedAnalysis: z.array(SectionSchema),
    disagreements: z.array(DisagreementSchema),
    limitations: z.array(z.string()),
    conclusion: z.string().min(50),
})

const SYNTHESIZER_SYSTEM_PROMPT = `You are Relay's Research Synthesizer. Produce a rigorous, evidence-grounded research report.

SYNTHESIS PRINCIPLES:
1. EVERY factual claim MUST be supported by evidence IDs from provided evidence
2. Distinguish: Direct facts (high), Inferences (medium), Interpretation (low), Uncertainty (explicit)
3. When sources disagree: Identify disagreement, represent each position with evidence, note stronger evidence, never silently choose
4. Cite sources only when they support the specific claim
5. Prefer primary/authoritative sources
6. Prefer recent sources for time-sensitive topics
7. Do not fabricate URLs, authors, dates, statistics, quotations
8. If evidence insufficient, state clearly

OUTPUT: JSON matching SynthesisSchema exactly.

STRUCTURE:
- Title: Clear, descriptive
- Executive Summary: 2-3 paragraphs, key takeaways
- Key Findings: 5-10 major findings with evidence IDs and confidence
- Detailed Analysis: Sections with headings, content, evidence IDs
- Disagreements: Explicit conflicts with evidence for each side
- Limitations: What couldn't be determined, gaps
- Conclusion: Balanced summary`

export async function handleSynthesis(payload: Record<string, unknown>, _job: {
    updateProgress: (value: unknown) => Promise<void>
}): Promise<SynthesisResult> {
    const router = createModelRouter()

    const problemLabel = payload.problemLabel as string
    const problemSummary = payload.problemSummary as string
    const targetPersona = payload.targetPersona as string
    const competitorMap = payload.competitorMap as Record<string, unknown>
    const featureGaps = payload.featureGaps as Record<string, unknown>
    const deadCompetitors = payload.deadCompetitors as Record<string, unknown>
    const communitySize = payload.communitySize as Record<string, unknown>
    const jobPostingVolume = payload.jobPostingVolume as number
    const fundingSignals = payload.fundingSignals as Record<string, unknown>
    const whyNow = payload.whyNow as string
    const trendDirection = payload.trendDirection as string
    const scoringBreakdown = payload.scoringBreakdown as Record<string, unknown>
    const evidenceQuotes = payload.evidenceQuotes as Array<{ quote: string; source: string; intentLabel: string }>
    const instruction = payload.instruction as string

    const evidenceText = evidenceQuotes.map((e, i) =>
        `[${i}] Source: ${e.source} | Intent: ${e.intentLabel}\n    Quote: ${e.quote}`
    ).join("\n\n")

    const prompt = `Research Topic: ${problemLabel}
Problem Summary: ${problemSummary}
Target Persona: ${targetPersona}
Competitor Map: ${JSON.stringify(competitorMap)}
Feature Gaps: ${JSON.stringify(featureGaps)}
Dead Competitors: ${JSON.stringify(deadCompetitors)}
Community Size: ${JSON.stringify(communitySize)}
Job Posting Volume: ${jobPostingVolume}
Funding Signals: ${JSON.stringify(fundingSignals)}
Why Now: ${whyNow}
Trend Direction: ${trendDirection}
Scoring Breakdown: ${JSON.stringify(scoringBreakdown)}

Evidence Quotes (${evidenceQuotes.length} items):
${evidenceText}

Instruction: ${instruction}

Generate the research report as JSON.`

    const request = {
        messages: [
            { role: "system" as const, content: SYNTHESIZER_SYSTEM_PROMPT },
            { role: "user" as const, content: prompt },
        ],
        role: "synthesizer" as const,
        temperature: 0.2,
        maxTokens: 8192,
        responseFormat: { type: "json_object" as const },
        task: "synthesis",
    }

    try {
        const response = await router.complete(request, "synthesizer")
        const parsed = JSON.parse(response.content)
        const validated = SynthesisSchema.parse(parsed)

        return {
            problemStatement: validated.title,
            targetPersona: validated.executiveSummary,
            solutionHypothesis: validated.keyFindings.map(f => f.claim).join("; "),
            mvpScope: validated.detailedAnalysis.map(s => s.heading).join("; "),
            differentiationAngle: validated.disagreements.map(d => d.topic).join("; "),
            goToMarketChannel: validated.conclusion,
            riskFactors: validated.limitations.map(l => ({ risk: l, source: "synthesis", severity: "MED" as const })),
            confidenceLevels: {
                overall: validated.keyFindings.filter(f => f.confidence === "high").length / Math.max(validated.keyFindings.length, 1),
                findings: validated.keyFindings.length,
                disagreements: validated.disagreements.length,
            },
        }
    } catch (error) {
        console.error("[SYNTHESIS] Failed to synthesize:", error)
        return createFallbackSynthesis(problemLabel, evidenceQuotes)
    }
}

function createFallbackSynthesis(problemLabel: string, evidenceQuotes: Array<{ quote: string; source: string; intentLabel: string }>): SynthesisResult {
    return {
        problemStatement: problemLabel,
        targetPersona: "Researcher",
        solutionHypothesis: "Further research needed",
        mvpScope: "Literature review and analysis",
        differentiationAngle: "Evidence-based approach",
        goToMarketChannel: "Academic/Technical publication",
        riskFactors: [
            { risk: "Insufficient evidence for strong conclusions", source: "synthesis", severity: "HIGH" as const },
            { risk: "Limited source diversity", source: "synthesis", severity: "MED" as const },
        ],
        confidenceLevels: {
            overall: 0.3,
            findings: 0,
            disagreements: 0,
        },
    }
}