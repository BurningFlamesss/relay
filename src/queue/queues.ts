import { Queue } from "bullmq";
import { connection } from "./connection";
import type { Stage } from "#/hooks/useAnalysis.tsx";

export type AnalyzeJobData = {
    jobId: string;
    userId: string;
    topic: string;
}

export type AnalyzeJobProgress = {
    stage: Stage;
    result?: string;
    error?: string;
}

export const analyzeQueue = new Queue<AnalyzeJobData>("analyze", { connection })

export const jobChannel = (jobId: string) => `job:${jobId}:progress`