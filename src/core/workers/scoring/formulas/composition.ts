import type { CandidateData } from "#/core/types.ts";
import { scoreCompetition } from "./competition";
import { scoreMarket } from "./market";
import { round } from "./normalizers";
import { scoreProblem } from "./problem";
import { scoreTiming } from "./timing";

const COMPOSITE_WEIGHTS = {
    problemStrength: 0.4,
    competitionOpportunity: 0.25,
    marketOpportunity: 0.20,
    timingScore: 0.15
} as const

export type Quadrant = "GOLD_ZONE" | "HARD_MARKET" | "NO_MARKET" | "COMMODITISED"

export interface CompositeResult {
    problemScore: number;
    competitionScore: number;
    marketScore: number;
    timingScore: number;
    compositeScore: number;
    quadrant: Quadrant;
    axes: {
        problemStrength: number;
        competitionDifficulty: number;
    }
}

export function computeComposite(candidate: CandidateData): CompositeResult {
    const problemScore = scoreProblem(candidate)
    const competitionScore = scoreCompetition(candidate)
    const marketScore = scoreMarket(candidate)
    const timingScore = scoreTiming(candidate)

    const weight = COMPOSITE_WEIGHTS

    const compositeScore = problemScore * weight.problemStrength + competitionScore * weight.competitionOpportunity + marketScore * weight.marketOpportunity + timingScore * weight.timingScore

    const xAxis = problemScore;
    const yAxis = 1 - competitionScore

    let quadrant: Quadrant;

    if (xAxis >= 0.5 && yAxis < 0.5) {
        quadrant = "GOLD_ZONE"
    } else if (xAxis >= 0.5 && yAxis >= 0.5) {
        quadrant = "HARD_MARKET"
    } else if (xAxis < 0.5 && yAxis < 0.5) {
        quadrant = "NO_MARKET"
    } else {
        quadrant = "COMMODITISED"
    }

    return {
        problemScore: round(problemScore),
        competitionScore: round(competitionScore),
        marketScore: round(marketScore),
        timingScore: round(timingScore),
        compositeScore: round(compositeScore),
        quadrant,
        axes: {
            problemStrength: round(xAxis),
            competitionDifficulty: round(yAxis)
        }
    }
}