import type { CandidateData, ScoringJobData, ScoringResult } from "#/core/types.ts";
import { prisma } from "#/db.ts";
import type { Job } from "bullmq";
import { computeComposite } from "./formulas/composition";

export async function processScoringJob(job: Job<ScoringJobData>): Promise<ScoringResult> {
    const { jobId, clusterIds } = job.data

    await job.updateProgress({
        message: `Scoring ${clusterIds.length} candidates...`
    })

    const candidates = await prisma.ideaCandidate.findMany({
        where: {
            id: {
                in: clusterIds
            }
        },
        include: {
            cluster: {
                include: {
                    signals: {
                        select: {
                            publishedAt: true,
                            intensityScore: true
                        }
                    }
                }
            }
        }
    })

    if (candidates.length === 0) {
        return {
            candidates: [],
            topScore: 0,
            meetsThreshold: false
        }
    }

    const scored = candidates.map((candidate) => {
        const data: CandidateData = {
            id: candidate.id,
            cluster: candidate.cluster ? {
                frequency: candidate.cluster.frequency,
                intensityScore: candidate.cluster.intensityScore,
                demandSignalCount: candidate.cluster.demandSignalCount,
                signals: candidate.cluster.signals
            } : null,
            competitorMap: candidate.competitorMap,
            featureGaps: candidate.featureGaps,
            deadCompetitors: candidate.deadCompetitors,
            communitySize: candidate.communitySize,
            jobPostingVolume: candidate.jobPostingVolume,
            fundingSignals: candidate.fundingSignals,
            trendDirection: candidate.trendDirection,
            whyNow: candidate.whyNow
        }

        const result = computeComposite(data)

        return {
            candidateId: candidate.id,
            clusterId: candidate.clusterId,
            ...result,
            scoringBreakdown: {
                ...result,
                components: {
                    frequency: candidate.cluster?.frequency,
                    intensityScore: candidate.cluster?.intensityScore,
                    demandSignalCount: candidate.cluster?.demandSignalCount,
                    featureGapCount: Array.isArray(candidate.featureGaps) ? candidate.featureGaps.length : 0,
                    competitorCount: Array.isArray(candidate.competitorMap) ? candidate.competitorMap.length : 0,
                    deadCompetitorCount: Array.isArray(candidate.deadCompetitors) ? candidate.deadCompetitors.length : 0,
                    trendDirection: candidate.trendDirection ?? "unknown",
                    whyNowPresent: !!candidate.whyNow
                }
            }
        }
    }).sort((a, b) => b.compositeScore - a.compositeScore)

    const topCandidateId = scored[0].candidateId
    const topScore = scored[0].compositeScore

    const scoreMap = new Map(scored.map((score) => [score.candidateId, score]))

    await prisma.$transaction([
        ...scored.map((score) => prisma.ideaCandidate.update({
            where: {
                id: score.candidateId
            },
            data: {
                problemScore: score.problemScore,
                competitionScore: score.competitionScore,
                marketScore: score.marketScore,
                timingScore: score.timingScore,
                compositeScore: score.compositeScore,
                scoringBreakdown: score.scoringBreakdown,
                status: score.candidateId === topCandidateId ? "ACTIVE" : "STASHED",
                stashedAt: score.candidateId === topCandidateId ? undefined : new Date()
            }
        })),
        ...candidates
            .filter((candidate) => candidate.clusterId)
            .map((candidate) => prisma.signalCluster.update({
                where: {
                    id: candidate.clusterId!
                },
                data: {
                    compositeScore: scoreMap.get(candidate.id)?.compositeScore ?? 0
                }
            }))
    ])

    await job.updateProgress({
        message: `Scoring done - top: ${topScore.toFixed(3)} (${scored[0].quadrant})`
    })

    return {
        candidates: scored.map(({ candidateId, problemScore, competitionScore, marketScore, timingScore, compositeScore, scoringBreakdown }) => ({
            candidateId, problemScore, competitionScore, marketScore, timingScore, compositeScore, scoringBreakdown
        })),
        topScore,
        meetsThreshold: topScore >= 0.65
    }
}