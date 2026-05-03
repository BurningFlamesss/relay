import { AnalyzeSchema } from "#/schema/analyze";
import { createServerFn } from "@tanstack/react-start";

export const startAnalyzeFn = createServerFn()
    .inputValidator(AnalyzeSchema)
    .handler(async ({ data }) => {

        // TODO: Create A JOB
        // TODO: Add to analysisQueue

        return {
            jobId: "test123"
        }
    })