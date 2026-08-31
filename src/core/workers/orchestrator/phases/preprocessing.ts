import { enqueuePreprocessingBatches, preprocessQueueEvents } from "#/core/queues.ts";
import { prisma } from "#/db.ts";
import { sign } from "node:crypto";
import type { PhaseContext } from "../context";
import { updatePhase } from "../phase-tracker";
import { PREPROCESS_BATCH_SIZE  } from "#/core/types.ts";
import type {PreprocessBatchResult} from "#/core/types.ts";
import { publishProgress } from "#/core/redis.ts";

export async function runPreprocessing(context: PhaseContext, newOnly = false): Promise<void> {
    const { jobId, isDone } = context

    if (!newOnly && isDone("SIGNAL_PREPROCESSING")) {
        return
    }

    if (!newOnly) {
        await context.progress("SIGNAL_PREPROCESSING", "Classifying and scoring signals...")
        await updatePhase(jobId, "SIGNAL_PREPROCESSING", "RUNNING")
        await prisma.analysisJob.update({
            where: {
                id: jobId
            },
            data: {
                currentPhase: "SIGNAL_PREPROCESSING"
            }
        })
    }

    const signals = await prisma.signal.findMany({
        where: {
            jobId,
            ...(newOnly ? { intentLabel: null } : {})
        },
        select: {
            id: true
        },
        orderBy: {
            createdAt: "asc"
        }
    })

    if (signals.length === 0) {
        return
    }

    const batchJobs = await enqueuePreprocessingBatches(jobId, signals.map(signal => signal.id), PREPROCESS_BATCH_SIZE)

    const results = await Promise.all(
        batchJobs.map((job) => job.waitUntilFinished(preprocessQueueEvents, 60_000).catch((): PreprocessBatchResult => ({
            processed: 0,
            demandSignalsFound: 0,
            batchIndex: -1
        })))
    )

    const totalProcessed = results.reduce((sum, result) => sum + result.processed, 0)
    const totalDemand = results.reduce((sum, result) => sum + result.demandSignalsFound, 0)

    await publishProgress({
        type: "SIGNAL_COUNT_UPDATE",
        jobId,
        signalCount: totalProcessed,
        message: `${totalProcessed} signals classified - ${totalDemand} demand signals`,
        timeStamp: Date.now()
    })

    if (!newOnly) {
        await updatePhase(jobId, "SIGNAL_PREPROCESSING", "COMPLETED", {
            summary: `${totalProcessed} signals classified, ${totalDemand} demand signals found`
        })

        await context.phaseDone("SIGNAL_PREPROCESSING", "Signals classified")
    }
}