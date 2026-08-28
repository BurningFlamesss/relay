import { Queue, type JobsOptions } from "bullmq";
import { connection } from "./connection";
import type { Stage } from "#/hooks/useAnalysis.tsx";
import { getUtilityConnection } from "./redis";

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

export const analyzeQueue = new Queue<AnalyzeJobData>("analyze", { connection, skipVersionCheck: true })

export const jobChannel = (jobId: string) => `job:${jobId}:progress`

const BASE: JobsOptions = {
    removeOnComplete: {
        count: 500, age: 86_400
    },
    removeOnFail: {
        count: 1000, age: 172_800
    },
    attempts: 3,
    backoff: {
        type: "exponential",
        delay: 2_000
    }
}

const CRITICAL: JobsOptions = {
    ...BASE,
    attempts: 5,
    backoff: {
        type: "exponential",
        delay: 3_000
    },
    priority: 1
}

function makeQueue(name, options) {
    return new Queue(name, {
        connection: getUtilityConnection(),
        defaultJobOptions: options ?? BASE
    })
}