import { discoverSources, getSourcesByCategory, searchSources } from "#/core/research/source-registry.ts"
import type { ResearchPlan, ResearchSource, SourceCategory, SourceDiscoveryResult } from "#/core/research/types.ts"

export interface SourceSelectionOptions {
    maxSources: number
    minAuthorityScore?: number
    requireMultipleCategories: boolean
    diversityFactor: number
    freshnessDays?: number
}

export interface SelectedSource extends ResearchSource {
    selectionReason: string
    matchedQueries: string[]
    estimatedRelevance: number
}

export class SourceSelector {
    private options: SourceSelectionOptions

    constructor(options: Partial<SourceSelectionOptions> = {}) {
        this.options = {
            maxSources: options.maxSources ?? 30,
            minAuthorityScore: options.minAuthorityScore ?? 0,
            requireMultipleCategories: options.requireMultipleCategories ?? true,
            diversityFactor: options.diversityFactor ?? 0.3,
            freshnessDays: options.freshnessDays,
        }
    }

    async selectSources(plan: ResearchPlan): Promise<SelectedSource[]> {
        const discovery = await discoverSources(plan, {
            maxSources: this.options.maxSources * 3,
            minAuthorityScore: this.options.minAuthorityScore,
        })

        const scored = this.scoreSources(discovery.sources, plan)
        const diversified = this.diversifySources(scored, plan)
        const selected = diversified.slice(0, this.options.maxSources)

        return selected.map(s => ({
            ...s.source,
            selectionReason: s.reason,
            matchedQueries: s.matchedQueries,
            estimatedRelevance: s.finalScore,
        }))
    }

    private scoreSources(
        sources: ResearchSource[],
        plan: ResearchPlan
    ): Array<{ source: ResearchSource; score: number; reason: string; matchedQueries: string[] }> {
        return sources.map(source => {
            let score = source.priority * 2
            const matchedQueries: string[] = []
            const reasons: string[] = []

            for (const query of plan.searchQueries) {
                const relevance = this.calculateQueryRelevance(source, query)
                if (relevance > 0.3) {
                    score += relevance * 10
                    matchedQueries.push(query.query)
                }
            }

            if (plan.sourceCategories.includes(source.category)) {
                score += 15
                reasons.push(`Category match: ${source.category}`)
            }

            if (source.authorityScore !== undefined) {
                score += source.authorityScore * 20
            }

            if (source.relevanceScore !== undefined) {
                score += source.relevanceScore * 15
            }

            if (source.freshnessScore !== undefined) {
                score += source.freshnessScore * 10
            }

            if (plan.preferredSources.some(p => source.url.includes(p) || source.domain.includes(p))) {
                score += 25
                reasons.push("Preferred source")
            }

            return {
                source,
                score,
                reason: reasons.join("; ") || "General relevance",
                matchedQueries,
            }
        })
    }

    private calculateQueryRelevance(source: ResearchSource, query: { query: string; expectedSourceTypes: SourceCategory[] }): number {
        const queryWords = query.query.toLowerCase().split(/\s+/).filter(w => w.length > 3)
        const domainWords = source.domain.toLowerCase().split(".")
        const nameWords = source.name.toLowerCase().split(/\s+/)

        let matches = 0
        for (const word of queryWords) {
            if (domainWords.some(d => d.includes(word))) matches++
            if (nameWords.some(n => n.includes(word))) matches++
        }

        const categoryMatch = query.expectedSourceTypes.includes(source.category) ? 1 : 0

        return (matches * 0.1) + (categoryMatch * 0.5)
    }

    private diversifySources(
        scored: Array<{ source: ResearchSource; score: number; reason: string; matchedQueries: string[] }>,
        plan: ResearchPlan
    ): Array<{ source: ResearchSource; score: number; reason: string; matchedQueries: string[] }> {
        const selected: Array<{ source: ResearchSource; score: number; reason: string; matchedQueries: string[] }> = []
        const usedDomains = new Set<string>()
        const usedCategories = new Set<SourceCategory>()

        const sorted = [...scored].sort((a, b) => b.score - a.score)

        for (const item of sorted) {
            const domain = item.source.domain
            const category = item.source.category

            const domainPenalty = usedDomains.has(domain) ? this.options.diversityFactor * 50 : 0
            const categoryPenalty = usedCategories.has(category) ? this.options.diversityFactor * 20 : 0

            const adjustedScore = item.score - domainPenalty - categoryPenalty

            if (adjustedScore > 0 || selected.length < 3) {
                selected.push({ ...item, score: adjustedScore })
                usedDomains.add(domain)
                usedCategories.add(category)
            }

            if (selected.length >= this.options.maxSources * 2) break
        }

        if (this.options.requireMultipleCategories && usedCategories.size < 2) {
            const additionalCategories = plan.sourceCategories.filter(c => !usedCategories.has(c))
            for (const cat of additionalCategories) {
                const catSources = scored
                    .filter(s => s.source.category === cat)
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 2)

                for (const s of catSources) {
                    if (!selected.find(sel => sel.source.id === s.source.id)) {
                        selected.push(s)
                        usedCategories.add(cat)
                    }
                }
            }
        }

        return selected.sort((a, b) => b.score - a.score)
    }

    async getSourcesForIteration(
        plan: ResearchPlan,
        previousSources: SelectedSource[],
        gapAnalysis: { missingCategories: SourceCategory[]; weakSubQuestions: string[] }
    ): Promise<SelectedSource[]> {
        const allSelected = new Set(previousSources.map(s => s.id))
        const additional: SelectedSource[] = []

        for (const category of gapAnalysis.missingCategories) {
            const sources = await getSourcesByCategory(category)
            for (const source of sources.slice(0, 3)) {
                if (!allSelected.has(source.id)) {
                    additional.push({
                        ...source,
                        selectionReason: `Fill category gap: ${category}`,
                        matchedQueries: [],
                        estimatedRelevance: source.priority * 2,
                    })
                    allSelected.add(source.id)
                }
            }
        }

        for (const subQuestion of gapAnalysis.weakSubQuestions.slice(0, 3)) {
            const sources = await searchSources(subQuestion, { maxResults: 5 })
            for (const source of sources) {
                if (!allSelected.has(source.id)) {
                    additional.push({
                        ...source,
                        selectionReason: `Address weak sub-question: ${subQuestion}`,
                        matchedQueries: [subQuestion],
                        estimatedRelevance: source.priority * 2,
                    })
                    allSelected.add(source.id)
                }
            }
        }

        return additional.slice(0, Math.max(5, this.options.maxSources - previousSources.length))
    }
}

export function createSourceSelector(options?: Partial<SourceSelectionOptions>): SourceSelector {
    return new SourceSelector(options)
}