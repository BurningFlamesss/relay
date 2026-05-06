import type { Stage } from "#/hooks/useAnalysis.tsx";
import { getSessionMiddleware } from "#/middleware/auth.middleware.ts";
import { connection } from "#/queue/connection.ts";
import { analyzeQueue } from "#/queue/queues.ts";
import { AnalyzeSchema } from "#/schema/analyze";
import { createServerFn } from "@tanstack/react-start";

export const startAnalyzeFn = createServerFn()
    .middleware([getSessionMiddleware])
    .inputValidator(AnalyzeSchema)
    .handler(async ({ data, context }) => {
        // TODO: Redirect to /authentication page if no session

        // TODO: Create a real JOB in the database
        const jobId = crypto.randomUUID()

        await analyzeQueue.add(
            "analyze",
            {
                jobId,
                userId: context.session?.user.id ?? "",
                topic: data.topic
            }, 
            {
                jobId,
                attempts: 3,
                backoff: { type: "exponential" , delay: 2000 },
                removeOnComplete: false,
                removeOnFail: false
            }
        )

        return {
            jobId
        }
    })

export const getLatestJobFn = createServerFn()
    .middleware([getSessionMiddleware])
    .handler(async ({ context }) => {
        // TODO: Redirect to /authentication page if no session

        // TODO: Get the actual data {id, status, lastStage, report}
        // const stages: Array<Stage> = ["idle", "processing", "confirmed", "thinking", "researching", "evaluating", "stitching", "done", "error"]
        // const status = ["complete", "failed", "in_progress"]
        // const jobId = crypto.randomUUID()

        // const job = {
        //     id: jobId,
        //     status: status[Math.floor(Math.random() * status.length)],
        //     lastStage: stages[Math.floor(Math.random() * stages.length)],
        //     report: ""
        // }

        const jobs = await analyzeQueue.getJobs(
            ["active", "completed", "failed", "waiting"],
            0, 10
        )

        const userJobs = jobs
        // .filter(job => job.data.userId === context.session?.user.id)
        .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))

        const latest = userJobs[0]

        if (!latest) return

        const state = await latest.getState()
        const progress = latest.progress as {stage?: Stage} | null

        if (state === "completed") {
            const stored = await connection.get(`job:${latest.data.jobId}:result`)
            const parse = stored ? JSON.parse(stored) : null

            return {
                id: latest.data.jobId,
                status: "completed" as const,
                lastStage: "done",
                report: parse?.report ?? null
            }
        }

        if (state === "failed") {
            return {
                id: latest.data.jobId,
                status: "failed" as const,
                lastStage: "error",
                report: null
            }
        }

        return {
            id: latest.data.jobId,
            status: "in_progress" as const,
            lastStage: progress?.stage ?? "processing",
            report: null
        }
    }) 