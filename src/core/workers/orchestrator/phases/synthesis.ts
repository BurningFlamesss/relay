import { aiQueueEvents, enqueueAITask } from "#/core/queues.ts";
import { AI_CALL_TIMEOUT_MS, type SynthesisResult } from "#/core/types.ts";
import { prisma } from "#/db.ts";
import type { PhaseContext } from "../context";
import { updatePhase } from "../phase-tracker";

export async function runSynthesis(context: PhaseContext): Promise<void> {
    const { jobId, userId, isDone } = context

    if (isDone("SYNTHESIS")) {
        return
    }

    await context.progress("SYNTHESIS", "Synthesising final idea report...")
    await updatePhase(jobId, "SYNTHESIS", "RUNNING")
    await prisma.analysisJob.update({
        where: {
            id: jobId
        },
        data: {
            currentPhase: "SYNTHESIS"
        }
    })

    const topCandidate = await prisma.ideaCandidate.findFirst({
        where: {
            jobId,
            status: "ACTIVE"
        },
        orderBy: {
            compositeScore: "desc"
        },
        include: {
            cluster: {
                include: {
                    signals: {
                        take: 200,
                        orderBy: {
                            intensityScore: "desc"
                        }
                    }
                }
            }
        }
    })

    if (!topCandidate) {
        throw new Error(`No active candidates for synthesis in job ${jobId}`)
    }

    const synthesisJob = await enqueueAITask({
        jobId,
        task: "SYNTHESIS",
        payload: {
            problemLabel: topCandidate.problemLabel,
            problemSummary: topCandidate.problemSummary,
            targetPersona: topCandidate.targetPersona,
            competitorMap: topCandidate.competitorMap,
            featureGaps: topCandidate.featureGaps,
            deadCompetitors: topCandidate.deadCompetitors,
            communitySize: topCandidate.communitySize,
            jobPostingVolume: topCandidate.jobPostingVolume,
            fundingSignals: topCandidate.fundingSignals,
            whyNow: topCandidate.whyNow,
            trendDirection: topCandidate.trendDirection,
            scoringBreakdown: topCandidate.scoringBreakdown,
            evidenceQuotes: topCandidate.cluster.signals.slice(0, 50).map((signal) => ({
                quote: signal.quote,
                source: signal.source,
                intentLabel: signal.intentLabel
            })),
            instruction: "Synthesis only what the evidence shows. Do not invent."
        }
    })

    const result = (await synthesisJob.waitUntilFinished(aiQueueEvents, AI_CALL_TIMEOUT_MS * 2)) as SynthesisResult

    await prisma.idea.upsert({
        where: {
            jobId
        },
        create: {
            jobId,
            userId,
            problemStatement: result.problemStatement,
            targetPersona: result.targetPersona,
            solutionHypothesis: result.solutionHypothesis,
            mvpScope: result.mvpScope,
            differentiationAngle: result.differentiationAngle,
            goToMarketChannel: result.goToMarketChannel,
            riskFactors: result.riskFactors,
            confidenceLevels: result.confidenceLevels,
            compositeScore: topCandidate.competitionScore ?? 0,
            scoringBreakdown: topCandidate.scoringBreakdown,
            status: "PENDING"
        },
        update: {
            problemStatement: result.problemStatement,
            targetPersona: result.targetPersona,
            solutionHypothesis: result.solutionHypothesis,
            mvpScope: result.mvpScope,
            differentiationAngle: result.differentiationAngle,
            goToMarketChannel: result.goToMarketChannel,
            riskFactors: result.riskFactors,
            confidenceLevels: result.confidenceLevels,
        }
    })


    await updatePhase(jobId, "SYNTHESIS", "COMPLETED", {
        summary: "Problem statement, persona, MVP, and risk factors synthesised"
    })

    await context.phaseDone("SYNTHESIS", "Synthesis complete")
}