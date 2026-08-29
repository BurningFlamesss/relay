import type { CandidateData } from "#/core/types.ts";
import { fundingScore, sigmoid } from "./normalizers";

export const MARKET_WEIGHTS = {
    communitySize: 0.35,
    jobPostingVolume: 0.30,
    fundingTrajectory: 0.35
}

export function scoreMarket(candidate: CandidateData): number {
    const weight = MARKET_WEIGHTS

    const communities = (candidate.communitySize as Array<{ memberCount?: number }> | null) ?? []
    const totalMembers = communities.reduce((sum, community) => sum + (community.memberCount ?? 0), 0)

    const communityScore = sigmoid(totalMembers, 0.000008)

    const jobScore = sigmoid(candidate.jobPostingVolume ?? 0, 0.02)
    const fundScore = fundingScore((candidate.fundingSignals as Array<{ date?: string; amount?: number }> | null) ?? [])

    return communityScore * weight.communitySize + jobScore * weight.jobPostingVolume + fundScore * weight.fundingTrajectory
}