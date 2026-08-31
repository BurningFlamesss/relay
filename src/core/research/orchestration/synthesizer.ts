import { createModelRouter  } from "#/core/research/model-router.ts"
import type {ModelRouter} from "#/core/research/model-router.ts";
import type {
    ResearchPlan,
    ResearchDocument,
    Evidence,
    ResearchFinding,
    Disagreement,
    ResearchReport,
    SourceReference,
    AnalysisSection,
} from "#/core/research/types.ts"
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

const SYNTHESIZER_SYSTEM_PROMPT = `You are Relay's Research Synthesizer. Your job is to produce a rigorous, evidence-grounded research report from the collected evidence.

SYNTHESIS PRINCIPLES:
1. EVERY factual claim MUST be supported by evidence IDs from the provided evidence
2. Distinguish between:
   - Directly stated facts (high confidence)
   - Reasonable inferences (medium confidence)  
   - Analyst interpretation (low confidence)
   - Uncertainty (explicitly state when evidence is insufficient)
3. When sources disagree:
   - Explicitly identify the disagreement
   - Represent each position with its supporting evidence
   - Note which position has stronger/more authoritative evidence
   - Never silently choose one side
4. Do not cite a source merely because it's topically related - the citation must support the specific claim
5. Prefer primary and authoritative sources
6. Prefer recent sources for time-sensitive topics
7. Do not fabricate URLs, authors, dates, statistics, or quotations
8. If evidence is insufficient for a sub-question, state this clearly

OUTPUT FORMAT: JSON matching the SynthesisSchema exactly.

STRUCTURE:
- Title: Clear, descriptive
- Executive Summary: 2-3 paragraphs, key takeaways
- Key Findings: 5-10 major findings, each with evidence IDs and confidence
- Detailed Analysis: Sections with headings, content, evidence IDs
- Disagreements: Explicit conflicts with evidence for each side
- Limitations: What couldn't be determined, gaps in evidence
- Conclusion: Balanced summary`

const SYNTHESIZER_USER_PROMPT = `Research Question: {{question}}
Research Intent: {{intent}}
Sub-questions: {{subQuestions}}
Depth: {{depth}}

Evidence Collected ({{evidenceCount}} items):
{{evidence}}

Sources ({{sourceCount}}):
{{sources}}

Generate the research report as JSON.`

export class ResearchSynthesizer {
    private router: ModelRouter

    constructor(router?: ModelRouter) {
        this.router = router ?? createModelRouter()
    }

    async synthesize(
        plan: ResearchPlan,
        documents: ResearchDocument[],
        evidence: Evidence[],
        sources: Array<{ id: string; name: string; domain: string; url: string; category: string }>
    ): Promise<ResearchReport> {
        const evidenceText = this.formatEvidence(evidence)
        const sourcesText = this.formatSources(sources)

        const prompt = SYNTHESIZER_USER_PROMPT
            .replace("{{question}}", plan.question)
            .replace("{{intent}}", plan.intent)
            .replace("{{subQuestions}}", plan.subQuestions.join("\n- "))
            .replace("{{depth}}", plan.depth)
            .replace("{{evidenceCount}}", String(evidence.length))
            .replace("{{evidence}}", evidenceText)
            .replace("{{sourceCount}}", String(sources.length))
            .replace("{{sources}}", sourcesText)

        const request = {
            messages: [
                { role: "system" as const, content: SYNTHESIZER_SYSTEM_PROMPT },
                { role: "user" as const, content: prompt },
            ],
            role: "synthesizer" as const,
            temperature: 0.2,
            maxTokens: 8192,
            responseFormat: { type: "json_object" as const },
            task: "synthesize_report",
        }

        try {
            const response = await this.router.complete(request, "synthesizer")
            const parsed = JSON.parse(response.content)
            const validated = SynthesisSchema.parse(parsed)

            return this.buildReport(plan, validated, documents, evidence, sources)
        } catch (error) {
            console.error("[SYNTHESIZER] Failed to synthesize:", error)
            return this.createFallbackReport(plan, documents, evidence, sources)
        }
    }

    private formatEvidence(evidence: Evidence[]): string {
        return evidence.slice(0, 50).map((e, i) => 
            `[${i}] Claim: ${e.claim}\n    Support: ${e.supportingText.slice(0, 300)}\n    Type: ${e.evidenceType} | Relevance: ${e.relevance.toFixed(2)} | Confidence: ${e.confidence.toFixed(2)}`
        ).join("\n\n")
    }

    private formatSources(sources: Array<{ id: string; name: string; domain: string; url: string; category: string }>): string {
        return sources.map(s => `- ${s.name} (${s.domain}) [${s.category}] - ${s.url}`).join("\n")
    }

    private buildReport(
        plan: ResearchPlan,
        synthesis: z.infer<typeof SynthesisSchema>,
        documents: ResearchDocument[],
        evidence: Evidence[],
        sources: Array<{ id: string; name: string; domain: string; url: string; category: string }>
    ): ResearchReport {
        const sourceRefs: SourceReference[] = sources.map(s => ({
            id: s.id,
            name: s.name,
            domain: s.domain,
            url: s.url,
            category: s.category as any,
            documentCount: documents.filter(d => d.domain === s.domain).length,
            evidenceCount: evidence.filter(e => {
                const doc = documents.find(d => d.id === e.documentId)
                return doc?.domain === s.domain
            }).length,
            relevanceScore: 0.7,
            authorityScore: 0.7,
            freshnessScore: 0.7,
        }))

        const wordCount = [
            synthesis.executiveSummary,
            ...synthesis.keyFindings.map(f => f.explanation),
            ...synthesis.detailedAnalysis.map(s => s.content),
            synthesis.conclusion,
        ].join(" ").split(/\s+/).length

        return {
            id: `report-${Date.now()}`,
            title: synthesis.title,
            executiveSummary: synthesis.executiveSummary,
            keyFindings: synthesis.keyFindings.map((f, i) => ({
                ...f,
                id: `finding-${i}`,
            })),
            detailedAnalysis: synthesis.detailedAnalysis.map((s, i) => ({
                ...s,
                id: `section-${i}`,
                subSections: s.subSections?.map((sub, j) => ({ ...sub, id: `section-${i}-${j}` })),
            })),
            disagreements: synthesis.disagreements.map((d, i) => ({ ...d, id: `disagreement-${i}` })),
            limitations: synthesis.limitations,
            conclusion: synthesis.conclusion,
            sources: sourceRefs,
            wordCount,
            readingTimeMinutes: Math.ceil(wordCount / 200),
            createdAt: new Date(),
        }
    }

    private createFallbackReport(
        plan: ResearchPlan,
        documents: ResearchDocument[],
        evidence: Evidence[],
        sources: Array<{ id: string; name: string; domain: string; url: string; category: string }>
    ): ResearchReport {
        const sourceRefs: SourceReference[] = sources.map(s => ({
            id: s.id,
            name: s.name,
            domain: s.domain,
            url: s.url,
            category: s.category as any,
            documentCount: documents.filter(d => d.domain === s.domain).length,
            evidenceCount: evidence.filter(e => {
                const doc = documents.find(d => d.id === e.documentId)
                return doc?.domain === s.domain
            }).length,
            relevanceScore: 0.5,
            authorityScore: 0.5,
            freshnessScore: 0.5,
        }))

        const findings: ResearchFinding[] = evidence.slice(0, 10).map((e, i) => ({
            id: `finding-fb-${i}`,
            claim: e.claim,
            explanation: e.supportingText.slice(0, 500),
            evidenceIds: [e.id],
            confidence: "low" as const,
            category: "extracted",
        }))

        return {
            id: `report-fb-${Date.now()}`,
            title: `Research Report: ${plan.question}`,
            executiveSummary: `This report addresses "${plan.question}" based on ${documents.length} documents and ${evidence.length} evidence items. Due to synthesis limitations, this is a simplified summary.`,
            keyFindings: findings,
            detailedAnalysis: [{
                id: "section-fb-1",
                heading: "Evidence Summary",
                content: `Collected ${evidence.length} evidence items from ${documents.length} documents across ${sources.length} sources.`,
                evidenceIds: evidence.slice(0, 20).map(e => e.id),
            }],
            disagreements: [],
            limitations: [
                "Automated synthesis fallback used - report may lack depth and coherence",
                "Evidence not fully analyzed for conflicts or gaps",
                "Confidence levels are conservative estimates",
            ],
            conclusion: "Further analysis recommended with full synthesis capability.",
            sources: sourceRefs,
            wordCount: 200,
            readingTimeMinutes: 1,
            createdAt: new Date(),
        }
    }
}

export function createResearchSynthesizer(router?: ModelRouter): ResearchSynthesizer {
    return new ResearchSynthesizer(router)
}