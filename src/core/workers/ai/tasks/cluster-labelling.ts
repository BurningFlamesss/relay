import type { ClusterLabelingResult } from "#/core/types.ts";

export async function handleClusteringLabelling(payload: Record<string, unknown>, _job: {
    updateProgress: (value: unknown) => Promise<void>
}): Promise<ClusterLabelingResult> {

    // TODO: Implement AI

    return {
        clusters: []
    }
}