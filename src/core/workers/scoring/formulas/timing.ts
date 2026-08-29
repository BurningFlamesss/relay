import type { CandidateData } from "#/core/types.ts";
import { trendDirectionScore } from "./normalizers";

export const TIMING_WEIGHTS = {
    trendDirection: 0.55,
    whyNowStrength: 0.45
} as const

export function scoreTiming(candidate: CandidateData): number {
    const weight = TIMING_WEIGHTS

    const trendScore = trendDirectionScore(candidate.trendDirection)

    const whyNow = candidate.whyNow ?? ""

    const whyNowScore = whyNow.length === 0 ? 0 : Math.min(1, whyNow.length / 200)

    return trendScore * weight.trendDirection + whyNowScore * weight.whyNowStrength
}