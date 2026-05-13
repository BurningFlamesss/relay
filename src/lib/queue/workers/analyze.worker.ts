import { Worker } from "bullmq";
import { connection } from "../connection";
import type { AnalyzeJobProgress } from "../queues";
import { jobChannel } from "../queues";


export const analyzeWorker = new Worker("analyze", async (job) => {
    const { jobId, userId, topic } = job.data

    const publish = async (progress: AnalyzeJobProgress) => {
        await connection.publish(
            jobChannel(jobId),
            JSON.stringify(progress)
        )

        await job.updateProgress(progress)
    }

    try {
        await publish({ stage: "confirmed" })
        await publish({ stage: "thinking" })
        // Thinking step
        await publish({ stage: "researching" })
        // researching step
        await publish({ stage: "evaluating" })
        // Evaluating step
        // And, Other iterations and tasks like competition analysis, market analysis
        await publish({ stage: "stitching" })
        // const report = stitchingFn()

        const report = `Analysis completed for: ${topic}`
        await publish({ stage: "done", result: report })

        await connection.set(
            `job:${jobId}:result`,
            JSON.stringify({ report, completedAt: Date.now() }),
            "EX",
            60 * 60 * 24 * 7
        )

        return { report }
    } catch (error) {
        await publish({ stage: "error", error: `Analysis Failed: ${error}` }) // For debugging purpose in dev mode only
        throw error
    }

}, { connection, skipVersionCheck: true  })

analyzeWorker.on("failed", (job, error) => {
    console.error(`[AnalyzeWorker] JobId: ${job?.id} is failed: `, error)
})