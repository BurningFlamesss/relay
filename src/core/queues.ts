import { FlowProducer, Job, Queue, QueueEvents, type JobsOptions } from "bullmq";
import { connection } from "./connection";
import type { Stage } from "#/hooks/useAnalysis.tsx";
import { createDedicatedConnection, getUtilityConnection } from "./redis";
import { PREPROCESS_BATCH_SIZE, QUEUE, type AIJobData, type OrchestratorJobData, type PreprocessBatchResult, type PreprocessJobData, type ScoringJobData, type ScraperJobData, type ScraperResult } from "./types";

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

function makeQueue(name: string, options?: JobsOptions) {
    return new Queue(name, {
        connection: getUtilityConnection(),
        defaultJobOptions: options ?? BASE
    })
}

// Queues

export const orchestratorQueue = makeQueue<OrchestratorJobData>(QUEUE.ORCHESTRATOR, CRITICAL)
export const scraperQueue = makeQueue<ScraperJobData, ScraperResult>(QUEUE.SCRAPER, {
    ...BASE,
    attempts: 4,
    backoff: { type: "exponential", delay: 1000 }
})
export const preprocessQueue = makeQueue<PreprocessJobData, PreprocessBatchResult>(QUEUE.PREPROCESS, {
    ...BASE,
    backoff: { type: "fixed", delay: 1000 }
})
export const aiQueue = makeQueue<AIJobData>(QUEUE.AI, {
    ...CRITICAL,
    attempts: 4,
    backoff: { type: "exponential", delay: 5000 }
})
export const scoringQueue = makeQueue<ScoringJobData>(QUEUE.SCORING, {
    ...BASE,
    backoff: { type: "fixed", delay: 500 }
})
export const dlQueue = makeQueue<{ originalQueue: string; jobData: unknown; error: string }>(QUEUE.DLQ, {
    removeOnComplete: false,
    removeOnFail: false,
    attempts: 1
})


export const scraperQueueEvents = new QueueEvents(QUEUE.SCRAPER, {
    connection: createDedicatedConnection("qevents:scraper")
})
export const preprocessQueueEvents = new QueueEvents(QUEUE.PREPROCESS, {
    connection: createDedicatedConnection("qevents:preprocess")
})
export const aiQueueEvents = new QueueEvents(QUEUE.AI, {
    connection: createDedicatedConnection("qevents:ai")
})
export const scoringQueueEvents = new QueueEvents(QUEUE.SCORING, {
    connection: createDedicatedConnection("qevents:scoring")
})

export const flowProducer = new FlowProducer({
    connection: createDedicatedConnection("flow-producer")
})

export async function enqueueAnalysis(data: OrchestratorJobData): Promise<Job<OrchestratorJobData>> {
    return orchestratorQueue.add(`analysis:${data.topic.slice(0, 40)}`, data, {
        jobId: data.jobId,
        priority: data.tier === "HIGH" ? 1 : data.tier === "MID" ? 5 : 10
    })
}

export async function enqueueScrapers(jobs: Array<{
    name: string;
    data: ScraperJobData
}>): Promise<Job<ScraperJobData, Array<ScraperResult>>> {
    return scraperQueue.addBulk(jobs.map((job) => ({
        name: job.name,
        data: job.data,
        opts: {
            parent: {
                id: job.data.jobId, queue: QUEUE.ORCHESTRATOR
            },
            jobId: `${job.data.jobId}:${job.data.source}:iter${job.data.iterationNumber}`,
            attempts: 4,
            backoff: {
                type: "exponential",
                delay: 1500
            }
        }
    })))
}

export async function enqueuePreprocessingBatches(jobId: string, signalIds: Array<string>, batchSize = PREPROCESS_BATCH_SIZE): Promise<Job<PreprocessJobData, Array<PreprocessBatchResult>>> {
    const batches: Array<Array<string>> = []

    for (let index = 0; index < signalIds.length; index += batchSize) {
        batches.push(signalIds.slice(index, index + batchSize))
    }

    return preprocessQueue.addBulk(batches.map((batch, index) => ({
        name: `process:${jobId}:batch${index}`,
        data: {
            jobId, signalIds: batch, batchIndex: index, totalBranches: batches.length
        },
        opts: {
            jobId: `${jobId}:preprocess:${index}`
        }
    })))
}

export async function enqueueAITask(data: AIJobData): Promise<Job<AIJobData>> {
    const dedupJobId = data.cacheKey ? `ai:cache:${data.cacheKey}` : `ai:${data.jobId}:${data.task}:${Date.now()}`

    return aiQueue.add(`ai:${data.task}`, data, {
        jobId: dedupJobId
    })
}

export async function drainAndCloseQueues(): Promise<void> {
    await Promise.all([
        scraperQueue,
        preprocessQueue,
        aiQueue,
        scoringQueue
    ].map((queue) => queue.close()))

    await Promise.all([
        scraperQueueEvents,
        preprocessQueueEvents,
        aiQueueEvents,
        scoringQueueEvents
    ].map((event) => event.close()))

    await flowProducer.close()
}