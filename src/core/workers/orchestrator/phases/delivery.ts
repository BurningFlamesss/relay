import { publishProgress } from "#/core/redis.ts";
import { prisma } from "#/db.ts";
import type { PhaseContext } from "../context";
import { updatePhase } from "../phase-tracker";

export async function runReportAssembly(context: PhaseContext) {
    const { jobId, isDone } = context

    if (isDone("REPORT_ASSEMBLY")) {
        return
    }

    await context.progress("REPORT_ASSEMBLY", "Assembling final report...")
    await updatePhase(jobId, "REPORT_ASSEMBLY", "RUNNING")
    await assembleReport(jobId)
    await updatePhase(jobId, "REPORT_ASSEMBLY", "COMPLETED", {
        summary: "Timeline chart, competitor landscape, and browsable signals assembled"
    })
}

export async function runDelivery(context: PhaseContext): Promise<void> {
    const { jobId, userId } = context

    await context.progress("DELIVERY", "Delivering report to client...")
    await prisma.analysisJob.update({
        where:{
            id: jobId
        },
        data: {
            currentPhase: "DELIVERY"
        }
    })

    const stashedCount = await prisma.ideaCandidate.count({
        where: {
            jobId,
            status: "STASHED"
        }
    })


    await prisma.analysisJob.update({
        where: {
            id: jobId
        },
        data: {
            status: "COMPLETED",
            currentPhase: "DELIVERY",
            completedAt: new Date()
        }
    })

    await prisma.topicCache.upsert({
        where: {
            topicHash: context.topicHash
        },
        create: {
            topicHash: context.topicHash,
            topicNormalised: context.topic.toLowerCase().trim(),
            lastAnalysedAt: new Date(),
            cacheExpiresAt: new Date(Date.now() + 30 * 86_400_000),
            representativeJobId: jobId
        },
        update: {
            lastAnalysedAt: new Date(),
            cacheExpiresAt: new Date(Date.now() + 30 * 86_400_000),
            representativeJobId: jobId,
            hitCount: {
                set: 0
            }
        }
    })

    if (stashedCount > 0) {
        await prisma.notification.create({
            data: {
                userId,
                title: `${stashedCount} saved candidate${stashedCount > 1 ? "s": ""} from this analysis`,
                body: "These can be promoted to a full analysis at Phase 6 cost only.",
                link: `/jobs/${jobId}/candidates`
            }
        })
    }

    await publishProgress({
        type: "DONE",
        jobId,
        message: "Analysis complete",
        timeStamp: Date.now()
    })
}

async function assembleReport(jobId: string): Promise<void> {

}