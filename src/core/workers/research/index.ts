import { getWorkerConnection, publishProgress } from "#/core/redis.ts"
import { QUEUE  } from "#/core/types.ts"
import type {OrchestratorJobData} from "#/core/types.ts";
import { cpus } from "node:os"
import { processResearchJob } from "./processor.ts"
import { Worker } from "bullmq"
import { dlQueue } from "#/core/queues.ts"
import { prisma } from "#/db.ts"

export function createResearchWorker(): Worker {
    const worker = new Worker<OrchestratorJobData>(
        "research-orchestrator",
        processResearchJob,
        {
            connection: getWorkerConnection(),
            concurrency: Math.max(1, cpus().length - 1),
            lockDuration: 600_000,
            lockRenewTime: 120_000,
            maxStalledCount: 2,
        }
    )

    worker.on("completed", (job) => console.log(`[RESEARCH] Job ${job.id} completed`))
    worker.on("failed", async (job, error) => {
        console.error(`[RESEARCH] Job ${job?.id} failed: ${error}`)

        if (!job) return

        await dlQueue.add("dlq:research", {
            originalQueue: QUEUE.ORCHESTRATOR,
            jobData: job.data,
            error: error.message,
        })

        await prisma.researchJob.update({
            where: { id: job.data.jobId },
            data: { status: "FAILED" },
        }).catch(() => {})

        await publishProgress({
            type: "FATAL",
            jobId: job.data.jobId,
            error: error.message,
            message: "Research failed",
            timeStamp: Date.now(),
        })
    })

    worker.on("stalled", (id) => console.warn(`[RESEARCH] Job ${id} stalled - will retry`))
    worker.on("error", (error) => console.error("[RESEARCH] Worker error: ", error))

    return worker
}