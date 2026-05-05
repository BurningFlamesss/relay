import type { Stage } from "#/hooks/useAnalysis.tsx";
import { getSessionMiddleware } from "#/middleware/auth.middleware.ts";
import { AnalyzeSchema } from "#/schema/analyze";
import { createServerFn } from "@tanstack/react-start";

export const startAnalyzeFn = createServerFn()
    .middleware([getSessionMiddleware])
    .inputValidator(AnalyzeSchema)
    .handler(async ({ data, context }) => {

        // TODO: Create A JOB
        // TODO: Add to analysisQueue

        const jobId = crypto.randomUUID()

        return {
            jobId
        }
    })

export const getLatestJobFn = createServerFn()
    .middleware([getSessionMiddleware])
    .handler(async ({ context }) => {

        // TODO: Get the actual data {id, status, lastStage, report}
        const stages: Array<Stage> = ["idle", "processing", "confirmed", "thinking", "researching", "evaluating", "stitching", "done", "error"]
        const status = ["complete", "failed", "in_progress"]
        const jobId = crypto.randomUUID()

        const job = {
            id: jobId,
            status: status[Math.floor(Math.random() * status.length)],
            lastStage: stages[Math.floor(Math.random() * stages.length)],
            report: ""
        }

        return null
    }) 