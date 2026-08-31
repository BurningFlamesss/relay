import { QUEUE   } from "#/core/types.ts";
import type {ScoringJobData, ScoringResult} from "#/core/types.ts";
import { Worker } from "bullmq";
import { processScoringJob } from "./processor";
import { getWorkerConnection } from "#/core/redis.ts";
import { cpus } from "node:os";
import { dlQueue } from "#/core/queues.ts";

export function createScoringWorker(): Worker {
    const worker = new Worker<ScoringJobData, ScoringResult>(
        QUEUE.SCORING,
        processScoringJob,
        {
            connection: getWorkerConnection(),
            concurrency: Math.max(1, cpus().length - 1),
            lockDuration: 60000,
            lockRenewTime: 15000,
            maxStalledCount: 2
        }
    )

    worker.on("completed", (job, result: ScoringResult) => console.log(`[SCORING] Done - top: ${result.topScore.toFixed(3)}, threshold met: ${result.meetsThreshold}`))
    worker.on("failed", async (job, error) => {
        console.error(`[SCORING] ${job?.id} failed: ${error}`)

        if (!job) {
            return
        }

        await dlQueue.add("dlq:scoring", {
            originalQueue: QUEUE.SCORING,
            jobData: job.data,
            error: error.message
        })
    })

    worker.on("ready", () => console.log(`[SCORING] Worker ready - concurrency: ${Math.max(1, cpus().length - 1)}`))
    worker.on("error", (error) => console.error("[SCORING] Worker error: ", error))

    return worker
}