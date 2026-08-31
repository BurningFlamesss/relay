import { createModelRouter  } from "#/core/research/model-router.ts"
import type {ModelRouter} from "#/core/research/model-router.ts";
import type { ResearchDocument, Evidence, EvidenceType, ResearchPlan } from "#/core/research/types.ts"
import { z } from "zod"

const EvidenceSchema = z.object({
    claim: z.string().min(10).max(500),
    supportingText: z.string().min(20).max(2000),
    evidenceType: z.enum(["DIRECT_QUOTE", "PARAPHRASE", "STATISTICAL", "CITATION", "OPINION"]),
    relevance: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    location: z.string().optional(),
    startOffset: z.number().optional(),
    endOffset: z.number().optional(),
})

const EvidenceBatchSchema = z.object({
    evidence: z.array(EvidenceSchema),
})

const EXTRACTOR_SYSTEM_PROMPT = `You are Relay's Evidence Extractor. Your job is to extract specific, verifiable evidence from research documents that can be used to answer research questions.

EXTRACTION RULES:
1. Extract ONLY claims that are directly supported by the provided text
2. Each evidence item must have a clear claim and the exact supporting text from the document
3. Classify evidence type accurately:
   - DIRECT_QUOTE: Exact quote from the text (use sparingly, for key statements)
   - PARAPHRASE: Summary of information in your own words, but traceable to specific text
   - STATISTICAL: Numerical data, metrics, percentages, measurements
   - CITATION: Reference to another source within the document
   - OPINION: Subjective assessment, clearly marked as opinion
4. Relevance (0-1): How directly does this evidence address the research question?
5. Confidence (0-1): How certain are you that the supporting text actually supports the claim?
6. Include location info (section heading, paragraph) when possible

DO NOT:
- Invent claims not in the text
- Infer unsupported conclusions
- Extract generic/background information not relevant to the question
- Use text that doesn't actually support the claim

OUTPUT: JSON with "evidence" array. Maximum 10 items per document.`

const EXTRACTOR_USER_PROMPT = `Research Question: {{question}}
Research Plan Intent: {{intent}}
Sub-questions: {{subQuestions}}

Document:
URL: {{url}}
Title: {{title}}
Domain: {{domain}}
Content:
{{content}}

Extract relevant evidence as JSON.`

export class EvidenceExtractor {
    private router: ModelRouter

    constructor(router?: ModelRouter) {
        this.router = router ?? createModelRouter()
    }

    async extractEvidence(
        document: ResearchDocument,
        plan: ResearchPlan,
        options: { maxEvidencePerDoc?: number } = {}
    ): Promise<Evidence[]> {
        const prompt = EXTRACTOR_USER_PROMPT
            .replace("{{question}}", plan.question)
            .replace("{{intent}}", plan.intent)
            .replace("{{subQuestions}}", plan.subQuestions.join(", "))
            .replace("{{url}}", document.url)
            .replace("{{title}}", document.title ?? "Untitled")
            .replace("{{domain}}", document.domain)
            .replace("{{content}}", document.content.slice(0, 15000))

        const request = {
            messages: [
                { role: "system" as const, content: EXTRACTOR_SYSTEM_PROMPT },
                { role: "user" as const, content: prompt },
            ],
            role: "extractor" as const,
            temperature: 0.1,
            maxTokens: 4096,
            responseFormat: { type: "json_object" as const },
            task: "extract_evidence",
        }

        try {
            const response = await this.router.complete(request, "extractor")
            const parsed = JSON.parse(response.content)
            const validated = EvidenceBatchSchema.parse(parsed)

            return validated.evidence.slice(0, options.maxEvidencePerDoc ?? 10).map((e, i) => ({
                id: `${document.id}-ev-${i}`,
                documentId: document.id,
                ...e,
            }))
        } catch (error) {
            console.error("[EVIDENCE] Extraction failed:", error)
            return this.fallbackExtraction(document, plan)
        }
    }

    private fallbackExtraction(document: ResearchDocument, plan: ResearchPlan): Evidence[] {
        const evidence: Evidence[] = []
        const sentences = document.content.split(/[.!?]+/).filter(s => s.trim().length > 50)

        for (let i = 0; i < Math.min(sentences.length, 5); i++) {
            const sentence = sentences[i].trim()
            evidence.push({
                id: `${document.id}-ev-fb-${i}`,
                documentId: document.id,
                claim: sentence.slice(0, 200),
                supportingText: sentence,
                evidenceType: "PARAPHRASE",
                relevance: 0.5,
                confidence: 0.4,
                location: `paragraph-${i}`,
            })
        }

        return evidence
    }

    async extractEvidenceBatch(
        documents: ResearchDocument[],
        plan: ResearchPlan,
        options: { maxEvidencePerDoc?: number; concurrency?: number } = {}
    ): Promise<Evidence[]> {
        const { maxEvidencePerDoc = 10, concurrency = 3 } = options
        const allEvidence: Evidence[] = []

        for (let i = 0; i < documents.length; i += concurrency) {
            const batch = documents.slice(i, i + concurrency)
            const results = await Promise.allSettled(
                batch.map(doc => this.extractEvidence(doc, plan, { maxEvidencePerDoc }))
            )

            for (const result of results) {
                if (result.status === "fulfilled") {
                    allEvidence.push(...result.value)
                } else {
                    console.error("[EVIDENCE] Batch item failed:", result.reason)
                }
            }
        }

        return allEvidence
    }
}

export function createEvidenceExtractor(router?: ModelRouter): EvidenceExtractor {
    return new EvidenceExtractor(router)
}