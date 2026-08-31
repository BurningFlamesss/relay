import { createModelRouter } from "#/core/research/model-router.ts"
import type { QueryArchitectureResult } from "#/core/types.ts"
import { z } from "zod"

const ResearchPlanSchema = z.object({
    question: z.string(),
    intent: z.string(),
    subQuestions: z.array(z.string()),
    searchQueries: z.array(z.object({
        query: z.string(),
        intent: z.enum(["factual", "comparative", "exploratory", "technical", "financial", "opinion"]),
        priority: z.number(),
        expectedSourceTypes: z.array(z.enum([
            "OFFICIAL", "DOCUMENTATION", "ACADEMIC", "RESEARCH", "NEWS",
            "TECHNICAL", "COMPANY", "FINANCIAL", "COMMUNITY"
        ])),
    })),
    sourceCategories: z.array(z.enum([
        "OFFICIAL", "DOCUMENTATION", "ACADEMIC", "RESEARCH", "NEWS",
        "TECHNICAL", "COMPANY", "FINANCIAL", "COMMUNITY"
    ])),
    preferredSources: z.array(z.string()),
    freshnessRequirement: z.enum(["recent", "any", "historical"]),
    depth: z.enum(["QUICK", "STANDARD", "DEEP"]),
    estimatedSources: z.number(),
    estimatedIterations: z.number(),
})

const PLANNER_SYSTEM_PROMPT = `You are Relay's Research Planner. Create a comprehensive research plan for the given question.

Analyze the intent and scope, break into specific sub-questions, generate targeted search queries, identify authoritative source categories, specify freshness requirements, estimate sources and iterations needed.

PRINCIPLES:
- Prefer primary/authoritative sources (official docs, academic papers, primary sources)
- Technical questions: DOCUMENTATION, TECHNICAL, ACADEMIC
- Financial/market: FINANCIAL, NEWS, COMPANY
- Current events: NEWS, COMMUNITY with "recent" freshness
- Historical topics: "any" freshness acceptable
- Break complex questions into 3-7 sub-questions
- Generate 2-4 search queries per sub-question
- Each query needs clear intent label

OUTPUT: JSON matching ResearchPlanSchema exactly.`

export async function handleQueryArchitecture(payload: Record<string, unknown>, _job: {
    updateProgress: (value: unknown) => Promise<void>
}): Promise<QueryArchitectureResult> {
    const router = createModelRouter()
    const topic = (payload.topic as string | undefined) ?? ""
    const topicHash = (payload.topicHash as string | undefined) ?? ""
    const filters = (payload.filters as Record<string, unknown> | undefined) ?? {}
    const negativeContexts = (payload.negativeContexts as Array<Record<string, unknown>> | undefined) ?? []
    const targetQueryCount = typeof payload.targetQueryCount === "number" ? payload.targetQueryCount : 25

    const prompt = `Research Question: ${topic}
Topic Hash: ${topicHash}
Filters: ${JSON.stringify(filters)}
Negative Contexts: ${JSON.stringify(negativeContexts)}
Target Query Count: ${targetQueryCount}

Create a detailed research plan as JSON.`

    const request = {
        messages: [
            { role: "system" as const, content: PLANNER_SYSTEM_PROMPT },
            { role: "user" as const, content: prompt },
        ],
        role: "planner" as const,
        temperature: 0.2,
        maxTokens: 4096,
        responseFormat: { type: "json_object" as const },
        task: "query_architecture",
    }

    const response = await router.complete(request, "planner")

    try {
        const parsed = JSON.parse(response.content)
        const validated = ResearchPlanSchema.parse(parsed)

        return {
            queries: validated.searchQueries.map(q => ({
                query: q.query,
                intentLabel: mapIntentToLabel(q.intent),
                reasoning: `Priority ${q.priority}: ${q.intent} query for ${q.expectedSourceTypes.join(", ")} sources`,
            })),
negativeContextUsed: negativeContexts.length > 0,
        }
    } catch (error) {
        console.error("[QUERY_ARCHITECTURE] Failed to parse plan:", error)
        return createFallbackPlan(topic, filters, negativeContexts)
    }
}

function mapIntentToLabel(intent: string): "COMPLAINT" | "WORKAROUND" | "DEMAND" | "COMPETITOR" | "FAILURE_POST" | "FEATURE_REQUEST" {
    const intentMap: Record<string, "COMPLAINT" | "WORKAROUND" | "DEMAND" | "COMPETITOR" | "FAILURE_POST" | "FEATURE_REQUEST"> = {
        factual: "DEMAND",
        comparative: "COMPETITOR",
        exploratory: "FEATURE_REQUEST",
        technical: "WORKAROUND",
        financial: "DEMAND",
        opinion: "COMPLAINT",
    }
    return intentMap[intent] ?? "DEMAND"
}

function createFallbackPlan(topic: string, filters?: Record<string, unknown>, negativeContexts?: Array<Record<string, unknown>>): QueryArchitectureResult {
    const isFinancial = topic.toLowerCase().includes("financ") || topic.toLowerCase().includes("market") || topic.toLowerCase().includes("invest")
    const categories = isFinancial
        ? ["FINANCIAL", "NEWS", "COMPANY", "ACADEMIC"]
        : ["TECHNICAL", "DOCUMENTATION", "ACADEMIC", "RESEARCH"]

    return {
        queries: [
            { query: topic, intentLabel: "DEMAND", reasoning: "Primary research query" },
            { query: `${topic} best practices`, intentLabel: "FEATURE_REQUEST", reasoning: "Best practices exploration" },
            { query: `${topic} challenges limitations`, intentLabel: "COMPLAINT", reasoning: "Known issues exploration" },
            { query: `${topic} tutorial guide documentation`, intentLabel: "WORKAROUND", reasoning: "Technical implementation guides" },
        ],
        negativeContextUsed: (negativeContexts ?? []).length > 0,
    }
}