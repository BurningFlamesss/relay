import { preprocess } from 'better-auth';
import { Queue, type JobsOptions } from "bullmq";
import { connection } from "./connection";
import type { Stage } from "#/hooks/useAnalysis.tsx";
import { getUtilityConnection } from "./redis";
import { QUEUE } from "./types";

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

function makeQueue(name, options?: JobsOptions) {
    return new Queue(name, {
        connection: getUtilityConnection(),
        defaultJobOptions: options ?? BASE
    })
}

// Queues

export const orchestratorQueue = makeQueue(QUEUE.ORCHESTRATOR, CRITICAL)
export const scraperQueue = makeQueue(QUEUE.SCRAPER, {
    ...BASE,
    attempts: 4,
    backoff: { type: "exponential", delay: 1000 }
})
export const preprocessQueue = makeQueue(QUEUE.PREPROCESS, {
    ...BASE,
    backoff: { type: "fixed", delay: 1000 }
})
export const aiQueue = makeQueue(QUEUE.AI, {
    ...CRITICAL,
    attempts: 4,
    backoff: { type: "exponential", delay: 5000 }
})
export const scoringQueue = makeQueue(QUEUE.SCORING, {
    ...BASE,
    backoff: { type: "fixed", delay: 500 }
})
export const dlQueue = makeQueue(QUEUE.DLQ, {
    removeOnComplete: false,
    removeOnFail: false,
    attempts: 1
})


