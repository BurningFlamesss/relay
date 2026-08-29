import type { CandidateData } from "#/core/types.ts";

export const COMPETITION_WEIGHTS = {
    gapSize: 0.4,
    incumbentWeakness: 0.35,
    deadCompetitorLessons: 0.25
} as const

type CompetitorEntry = { weaknesses?: Array<string> }

export function scoreCompetition(candidate: CandidateData): number {
    const weight = COMPETITION_WEIGHTS
    const competitors = (candidate.competitorMap as Array<CompetitorEntry> | null) ?? []
    const featureGaps = (candidate.featureGaps as Array<string> | null) ?? []
    const dead = (candidate.deadCompetitors as Array<unknown> | null) ?? []

    const gapSize = Math.min(1, featureGaps.length / 10)

    const avgWeaknesses = competitors.length > 0 ? competitors.reduce((sum, competitor) => sum + (competitor.weaknesses?.length ?? 0), 0) / competitors.length : 0
    const incumbentWeakness = Math.min(1, avgWeaknesses / 5)

    const deadLessons = Math.min(1, dead.length / 3)

    return gapSize * weight.gapSize + incumbentWeakness * weight.incumbentWeakness + deadLessons * weight.deadCompetitorLessons
}