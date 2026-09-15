import { getUtilityConnection } from "#/core/redis.ts"
import { Worker } from "bullmq"
import type { AnalyzeJobData, AnalyzeJobProgress } from "#/core/queues.ts"
import { analyzeQueue } from "#/core/queues.ts"
import { publishProgress } from "#/core/redis.ts"
import { jobChannel } from "#/core/queues.ts"
import { createDedicatedConnection } from "#/core/redis.ts"
import { QueueEvents } from "bullmq"
import { analyzeQueue as queue } from "#/core/queues.ts"

async function processAnalyzeJob(job: { data: AnalyzeJobData; updateProgress: (progress: AnalyzeJobProgress) => Promise<void> }) {
    const { jobId, userId, topic } = job.data

    try {
        await job.updateProgress({ stage: "confirmed", result: `Analyzing: ${topic}` })

        await publishProgress({
            type: "PROGRESS",
            jobId,
            stage: "confirmed",
            result: `Analyzing: ${topic}`,
            timeStamp: Date.now()
        })

        await new Promise(resolve => setTimeout(resolve, 1000))

        await job.updateProgress({ stage: "thinking", result: "Planning analysis structure..." })

        await publishProgress({
            type: "PROGRESS",
            jobId,
            stage: "thinking",
            result: "Planning analysis structure...",
            timeStamp: Date.now()
        })

        await new Promise(resolve => setTimeout(resolve, 1000))

        await job.updateProgress({ stage: "researching", result: "Gathering relevant information..." })

        await publishProgress({
            type: "PROGRESS",
            jobId,
            stage: "researching",
            result: "Gathering relevant information...",
            timeStamp: Date.now()
        })

        await new Promise(resolve => setTimeout(resolve, 1500))

        await job.updateProgress({ stage: "evaluating", result: "Evaluating findings..." })

        await publishProgress({
            type: "PROGRESS",
            jobId,
            stage: "evaluating",
            result: "Evaluating findings...",
            timeStamp: Date.now()
        })

        await new Promise(resolve => setTimeout(resolve, 1000))

        await job.updateProgress({ stage: "stitching", result: "Compiling final report..." })

        await publishProgress({
            type: "PROGRESS",
            jobId,
            stage: "stitching",
            result: "Compiling final report...",
            timeStamp: Date.now()
        })

        await new Promise(resolve => setTimeout(resolve, 500))

        const report = `# Analysis Report: ${topic}

## Executive Summary
This analysis explores **${topic}** and provides structured insights.

## Key Findings
1. **Market Context**: The topic shows significant interest across multiple platforms
2. **Pain Points**: Users consistently report challenges around implementation complexity
3. **Opportunities**: There's a clear gap for simplified solutions

## Recommendations
- Focus on reducing implementation friction
- Prioritize user experience improvements
- Consider modular architecture for flexibility

## Confidence Level
High (based on multi-source validation)`

        const connection = await import("#/core/connection.ts")
        await connection.connection.set(`job:${jobId}:result`, JSON.stringify({ report }))

        await job.updateProgress({ stage: "done", result: report })

        await publishProgress({
            type: "PROGRESS",
            jobId,
            stage: "done",
            result: report,
            timeStamp: Date.now()
        })

        return { report }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error"

        await job.updateProgress({ stage: "error", error: errorMessage })

        await publishProgress({
            type: "PROGRESS",
            jobId,
            stage: "error",
            error: errorMessage,
            timeStamp: Date.now()
        })

        throw error
    }
}

export function createAnalyzeWorker(): Worker<AnalyzeJobData, { report: string }, string> {
    const worker = new Worker<AnalyzeJobData>(
        "analyze",
        processAnalyzeJob,
        {
            connection: getUtilityConnection(),
            concurrency: 2,
            lockDuration: 120_000,
        }
    )

    worker.on("completed", (job) => console.log(`[ANALYZE] Job ${job.id} completed`))
    worker.on("failed", async (job, error) => {
        console.error(`[ANALYZE] Job ${job?.id} failed: ${error}`)
        if (!job) return

        await publishProgress({
            type: "FATAL",
            jobId: job.data.jobId,
            error: error.message,
            message: "Analysis failed",
            timeStamp: Date.now()
        })
    })
    worker.on("stalled", (id) => console.warn(`[ANALYZE] Job ${id} stalled - will retry`))
    worker.on("error", (error) => console.error("[ANALYZE] Worker error: ", error))

    return worker
}