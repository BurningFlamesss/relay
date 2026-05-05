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

        const jobId = crypto.randomUUID()

        return {
            id: jobId,
            status: "in_progress",
            lastStage: "idle",
            report: ""
        }
    }) 