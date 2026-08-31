import { QUEUE  } from "#/core/types.ts";
import type {AIJobData} from "#/core/types.ts";
import { Worker } from "bullmq";
import { processAIJob } from "./processor";
import { getWorkerConnection } from "#/core/redis.ts";
import { dlQueue } from "#/core/queues.ts";

const AI_CONCURRENCY = 4
const RATE_LIMIT_MAX = 50
const RATE_LIMIT_WINDOW = 60_000
const AI_LOCK_DURATION = 300_000

export function createAIWorker(): Worker {
    const worker = new Worker<AIJobData>(
        QUEUE.AI,
        processAIJob,
        {
            connection: getWorkerConnection(),
            concurrency: AI_CONCURRENCY,
            limiter: {
                max: RATE_LIMIT_MAX,
                duration: RATE_LIMIT_WINDOW,
                groupKey: (_jobId: string) => "global"
            },
            lockDuration: AI_LOCK_DURATION,
            lockRenewTime: AI_LOCK_DURATION / 5,
            maxStalledCount: 2
        }
    )

    worker.on("completed", (job) => {
        const cached = (job.returnvalue)?.cached ? " (cached)" : ""
        console.log(`[AI] ${job.data.task} done${cached} for job ${job.data.jobId}`)
    })
    worker.on("failed", async (job, error) => {
        console.error(`[AI] ${job?.data.task} failed: ${error}`)

        if (!job) {
            return
        }

        if (error.message.includes("Rate limit")) {
            return
        }

        await dlQueue.add("dlq:aI", {
            originalQueue: QUEUE.AI,
            jobData: job.data,
            error: error.message
        })
    })

    worker.on("ready", () => console.log(`[AI] Worker ready - concurrency: ${AI_CONCURRENCY}, rate limit: ${RATE_LIMIT_MAX}/min`))
    worker.on("error", (error) => console.error("[AI] Worker error: ", error))

    return worker
}