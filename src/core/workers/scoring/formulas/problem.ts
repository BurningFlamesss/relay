import type { CandidateData } from "#/core/types.ts";
import { norm, recencyScore, sigmoid } from "./normalizers";

export const PROBLEM_WEIGHTS = {
    frequencyNorm: 0.3,
    intensityNorm: 0.35,
    recencyBonus: 0.2,
    demandSignalNorm: 0.15
} as const

export function scoreProblem(candidate: CandidateData): number {
    const cluster = candidate.cluster

    if (!cluster) {
        return 0
    }

    const weight = PROBLEM_WEIGHTS

    const frequencyNorm = sigmoid(cluster.frequency, 0.05)
    const intensityNorm = norm(cluster.intensityScore, 100)
    const recency = recencyScore(cluster.signals)
    const demandNorm = sigmoid(cluster.demandSignalCount, 0.2)

    return (
        frequencyNorm * weight.frequencyNorm +
        intensityNorm * weight.intensityNorm +
        recency * weight.recencyBonus +
        demandNorm * weight.demandSignalNorm
    )
}