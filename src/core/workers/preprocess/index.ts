import { QUEUE   } from "#/core/types.ts";
import type {PreprocessBatchResult, PreprocessJobData} from "#/core/types.ts";
import { Worker } from "bullmq";
import { processPreprocessBatch } from "./processor";
import { getWorkerConnection } from "#/core/redis.ts";
import { cpus } from "node:os";
import { dlQueue } from "#/core/queues.ts";
import { warmUp } from "./model";

export function createPreprocessWorker(): Worker {
    const worker = new Worker<PreprocessJobData, PreprocessBatchResult>(
        QUEUE.PREPROCESS,
        processPreprocessBatch,
        {
            connection: getWorkerConnection(),
            concurrency: Math.max(1, cpus().length - 2),
            limiter: {
                max: Math.max(1, cpus().length - 2) * 2,
                duration: 5000
            },
            lockDuration: 180000,
            lockRenewTime: 45000,
            maxStalledCount: 2
        }
    )

    worker.on("ready", async () => {
        console.log(`[PREPROCESS] Worker ready - warming up model...`)
        await warmUp()
    })


    worker.on("completed", (job, result: PreprocessBatchResult) => console.log(`[PREPROCESS] Batch ${result.batchIndex} - ${result.processed} signals, ${result.demandSignalsFound} demand`))
    worker.on("failed", async (job, error) => {
        console.error(`[PREPROCESS] Batch ${job?.data.batchIndex} failed: ${error}`)

        if (!job) {
            return
        }

        await dlQueue.add("dlq:preprocess", {
            originalQueue: QUEUE.PREPROCESS,
            jobData: job.data,
            error: error.message
        })
    })

    worker.on("error", (error) => console.error("[PREPROCESS] Worker error: ", error))

    return worker
}