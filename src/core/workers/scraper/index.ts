import { getWorkerConnection } from "#/core/redis.ts";
import { QUEUE   } from "#/core/types.ts";
import type {ScraperJobData, ScraperResult} from "#/core/types.ts";
import { Worker } from "bullmq";
import { processScrapeJob } from "./processor";
import { dlQueue } from "#/core/queues.ts";
import { prisma } from "#/db.ts";


export function createScraperWorker(): Worker {
    const worker = new Worker<ScraperJobData, ScraperResult>(
        QUEUE.SCRAPER,
        processScrapeJob,
        {
            connection: getWorkerConnection(),
            concurrency: 20,
            limiter: {
                max: 50,
                duration: 10_000
            },
            lockDuration: 120_000,
            lockRenewTime: 30_000,
            maxStalledCount: 3
        }
    )

    worker.on("completed", (job, result: ScraperResult) => console.log(`[SCRAPER] ${result.source}: ${result.signalCount} signals in ${result.durationMs}ms`))
    worker.on("failed", async (job, error) => {
        console.error(`[SCRAPER] ${job?.id} failed: ${error}`)

        if (!job) {
            return
        }

        await dlQueue.add("dlq:scraper", {
            originalQueue: QUEUE.SCRAPER,
            jobData: job.data,
            error: error.message
        })
        await prisma.scrapeJob.update({
            where: {
                id: job.data.scrapeJobId
            },
            data: {
                status: "FAILED",
                errorMessage: error.message,
                completedAt: new Date()
            }
        }).catch(() => { })
    })

    worker.on("ready", () => console.log(`[SCRAPER] Worker ready - concurrency: 20`))
    worker.on("error", (error) => console.error("[SCRAPER] Worker error: ", error))

    return worker
}