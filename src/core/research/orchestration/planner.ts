import { createModelRouter  } from "#/core/research/model-router.ts"
import type {ModelRouter} from "#/core/research/model-router.ts";
import type { ResearchPlan, ResearchQuestion, ResearchDepth, SearchQuery, SourceCategory } from "#/core/research/types.ts"
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

const PLANNER_SYSTEM_PROMPT = `You are Relay's Research Planner. Your job is to create a comprehensive research plan for a given question.

Given a research question, you must:
1. Analyze the intent and scope of the question
2. Break it down into specific sub-questions that need to be answered
3. Generate targeted search queries for each sub-question
4. Identify the most authoritative source categories for each query
5. Specify freshness requirements based on the question type
6. Estimate the number of sources and iterations needed

RESEARCH PLANNING PRINCIPLES:
- Prefer primary and authoritative sources (official docs, academic papers, primary sources)
- For technical questions: prioritize DOCUMENTATION, TECHNICAL, ACADEMIC sources
- For financial/market questions: prioritize FINANCIAL, NEWS, COMPANY sources  
- For current events: prioritize NEWS, COMMUNITY sources with "recent" freshness
- For historical/established topics: "any" freshness is acceptable
- Break complex questions into 3-7 specific sub-questions
- Generate 2-4 search queries per sub-question
- Each query should have a clear intent label

OUTPUT FORMAT: Return a JSON object matching the ResearchPlan schema exactly. Do not include any extra commentary.`

const PLANNER_USER_PROMPT_TEMPLATE = `Research Question: {{question}}
Depth: {{depth}}
Max Iterations: {{maxIterations}}
Max Sources: {{maxSources}}
Constraints: {{constraints}}

Create a detailed research plan as JSON.`

export class ResearchPlanner {
    private router: ModelRouter

    constructor(router?: ModelRouter) {
        this.router = router ?? createModelRouter()
    }

    async createPlan(question: ResearchQuestion): Promise<ResearchPlan> {
        const prompt = PLANNER_USER_PROMPT_TEMPLATE
            .replace("{{question}}", question.question)
            .replace("{{depth}}", question.depth)
            .replace("{{maxIterations}}", String(question.maxIterations ?? 3))
            .replace("{{maxSources}}", String(question.maxSources ?? 30))
            .replace("{{constraints}}", JSON.stringify(question.constraints ?? {}))

        const request = {
            messages: [
                { role: "system" as const, content: PLANNER_SYSTEM_PROMPT },
                { role: "user" as const, content: prompt },
            ],
            role: "planner" as const,
            temperature: 0.2,
            maxTokens: 4096,
            responseFormat: { type: "json_object" as const },
            task: "create_plan",
        }

        const response = await this.router.complete(request, "planner")

        try {
            const parsed = JSON.parse(response.content)
            const validated = ResearchPlanSchema.parse(parsed)
            return validated
        } catch (error) {
            console.error("[PLANNER] Failed to parse plan:", error)
            return this.createFallbackPlan(question)
        }
    }

    private createFallbackPlan(question: ResearchQuestion): ResearchPlan {
        const categories = this.inferCategories(question.question)
        const isFinancial = question.question.toLowerCase().includes("financ") ||
            question.question.toLowerCase().includes("market") ||
            question.question.toLowerCase().includes("invest") ||
            question.question.toLowerCase().includes("stock") ||
            question.question.toLowerCase().includes("price")

        const subQuestions = this.generateSubQuestions(question.question)
        const searchQueries = this.generateSearchQueries(question.question, subQuestions, categories)

        return {
            question: question.question,
            intent: this.inferIntent(question.question),
            subQuestions,
            searchQueries,
            sourceCategories: categories,
            preferredSources: [],
            freshnessRequirement: isFinancial ? "recent" : "any",
            depth: question.depth,
            estimatedSources: Math.min(question.maxSources ?? 30, subQuestions.length * 4),
            estimatedIterations: Math.min(question.maxIterations ?? 3, 3),
        }
    }

    private inferIntent(question: string): string {
        const lower = question.toLowerCase()
        if (lower.startsWith("what")) return "factual_inquiry"
        if (lower.startsWith("how")) return "process_inquiry"
        if (lower.startsWith("why")) return "causal_inquiry"
        if (lower.startsWith("compare") || lower.includes("vs") || lower.includes("versus")) return "comparative_analysis"
        if (lower.includes("best") || lower.includes("top") || lower.includes("recommend")) return "recommendation"
        if (lower.includes("latest") || lower.includes("current") || lower.includes("recent")) return "current_state_analysis"
        return "exploratory_research"
    }

    private inferCategories(question: string): SourceCategory[] {
        const lower = question.toLowerCase()
        const categories: SourceCategory[] = []

        if (lower.includes("api") || lower.includes("documentation") || lower.includes("docs") || lower.includes("sdk")) {
            categories.push("DOCUMENTATION", "OFFICIAL")
        }
        if (lower.includes("paper") || lower.includes("study") || lower.includes("research") || lower.includes("academic")) {
            categories.push("ACADEMIC", "RESEARCH")
        }
        if (lower.includes("financial") || lower.includes("market") || lower.includes("stock") || lower.includes("invest") || lower.includes("price") || lower.includes("earning")) {
            categories.push("FINANCIAL", "COMPANY", "NEWS")
        }
        if (lower.includes("technical") || lower.includes("implementation") || lower.includes("code") || lower.includes("architecture") || lower.includes("algorithm")) {
            categories.push("TECHNICAL", "DOCUMENTATION")
        }
        if (lower.includes("news") || lower.includes("latest") || lower.includes("recent") || lower.includes("announcement")) {
            categories.push("NEWS", "COMPANY")
        }
        if (lower.includes("community") || lower.includes("forum") || lower.includes("discussion") || lower.includes("opinion")) {
            categories.push("COMMUNITY")
        }

        if (categories.length === 0) {
            categories.push("TECHNICAL", "DOCUMENTATION", "RESEARCH", "NEWS")
        }

        return [...new Set(categories)]
    }

    private generateSubQuestions(question: string): string[] {
        const lower = question.toLowerCase()
        const subQuestions: string[] = []

        if (lower.includes("approach") || lower.includes("method") || lower.includes("technique")) {
            subQuestions.push("What are the main approaches or methods?")
            subQuestions.push("What are the trade-offs between different approaches?")
            subQuestions.push("What are the current best practices?")
        }
        if (lower.includes("tool") || lower.includes("framework") || lower.includes("library")) {
            subQuestions.push("What tools/frameworks are available?")
            subQuestions.push("How do they compare in features and performance?")
            subQuestions.push("What are the adoption trends?")
        }
        if (lower.includes("challenge") || lower.includes("problem") || lower.includes("issue") || lower.includes("limitation")) {
            subQuestions.push("What are the known challenges or limitations?")
            subQuestions.push("What solutions or workarounds exist?")
        }
        if (lower.includes("trend") || lower.includes("future") || lower.includes("direction")) {
            subQuestions.push("What are the current trends?")
            subQuestions.push("What future developments are expected?")
        }
        if (lower.includes("compare") || lower.includes("vs") || lower.includes("versus")) {
            subQuestions.push("What are the key differences?")
            subQuestions.push("What are the pros and cons of each?")
        }

        if (subQuestions.length === 0) {
            subQuestions.push("What is the current state of the art?")
            subQuestions.push("What are the key concepts and terminology?")
            subQuestions.push("What are the main applications or use cases?")
        }

        return subQuestions.slice(0, 7)
    }

    private generateSearchQueries(
        question: string,
        subQuestions: string[],
        categories: SourceCategory[]
    ): SearchQuery[] {
        const queries: SearchQuery[] = []
        const baseQuery = question.replace(/[?!.]/g, "").trim()

        queries.push({
            query: baseQuery,
            intent: "factual",
            priority: 10,
            expectedSourceTypes: categories,
        })

        for (let i = 0; i < subQuestions.length && i < 5; i++) {
            const sq = subQuestions[i].replace(/[?!.]/g, "").trim()
            queries.push({
                query: sq,
                intent: "exploratory",
                priority: 8 - i,
                expectedSourceTypes: categories,
            })
        }

        if (categories.includes("TECHNICAL") || categories.includes("DOCUMENTATION")) {
            queries.push({
                query: `${baseQuery} tutorial OR guide OR documentation`,
                intent: "technical",
                priority: 7,
                expectedSourceTypes: ["DOCUMENTATION", "TECHNICAL"],
            })
        }

        if (categories.includes("ACADEMIC") || categories.includes("RESEARCH")) {
            queries.push({
                query: `${baseQuery} paper OR study OR research`,
                intent: "factual",
                priority: 7,
                expectedSourceTypes: ["ACADEMIC", "RESEARCH"],
            })
        }

        if (categories.includes("NEWS") || categories.includes("FINANCIAL")) {
            queries.push({
                query: `${baseQuery} 2024 OR 2025 OR latest`,
                intent: "factual",
                priority: 8,
                expectedSourceTypes: ["NEWS", "FINANCIAL", "COMPANY"],
            })
        }

        return queries.slice(0, 15)
    }
}

export function createResearchPlanner(router?: ModelRouter): ResearchPlanner {
    return new ResearchPlanner(router)
}