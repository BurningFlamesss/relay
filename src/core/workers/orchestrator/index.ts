import { getWorkerConnection, publishProgress } from "#/core/redis.ts";
import { QUEUE  } from "#/core/types.ts";
import type {OrchestratorJobData} from "#/core/types.ts";
import { cpus } from "node:os";
import { processAnalysis } from "./processor";
import { Worker } from "bullmq";
import { dlQueue } from "#/core/queues.ts";
import { prisma } from "#/db.ts";


export function createOrchestratorWorker(): Worker {
    const worker = new Worker<OrchestratorJobData>(
        QUEUE.ORCHESTRATOR,
        processAnalysis,
        {
            connection: getWorkerConnection(),
            concurrency: Math.max(1, cpus().length - 1),
            lockDuration: 300_000,
            lockRenewTime: 60_000,
            maxStalledCount: 2
        }
    )

    worker.on("completed", (job) => console.log(`[ORCHESTRATOR] Job ${job.id} completed`))
    worker.on("failed", async (job, error) => {
        console.error(`[ORCHESTRATOR] Job ${job?.id} failed: ${error}`)

        if (!job) {
            return
        }

        await dlQueue.add("dlq:orchestrator", {
            originalQueue: QUEUE.ORCHESTRATOR,
            jobData: job.data,
            error: error.message
        })
        await prisma.analysisJob.update({
            where: {
                id: job.data.jobId
            },
            data: {
                status: "FAILED",
            }
        }).catch(() => { })

        await publishProgress({
            type: "FATAL",
            jobId: job.data.jobId,
            error: error.message,
            message: "Analysis failed - credits will be refunded",
            timeStamp: Date.now()
        })
    })

    worker.on("stalled", (id) => console.warn(`[ORCHESTRATOR] Job ${id} stalled - will retry`))
    worker.on("error", (error) => console.error("[ORCHESTRATOR] Worker error: ", error))

    return worker
}