import type { QueryArchitectureResult } from "#/core/types.ts";

export async function handleDrillDownQueries(payload: Record<string, unknown>, _job: {
    updateProgress: (value: unknown) => Promise<void>
}): Promise<QueryArchitectureResult> {

    // TODO: Implement AI

    return {
        queries: [],
        negativeContextUsed: false
    }
}