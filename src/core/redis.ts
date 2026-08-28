import { serverEnv } from "#/env/server.ts";
import { preprocess } from "better-auth";
import IORedis from "ioredis";
import type { Redis, RedisOptions } from "ioredis";

const BASE_OPTIONS: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 10000,
    retryStrategy: (times) => (times > 10 ? null : Math.min(times * 200, 3000))
}

let _worker: Redis | null = null
let _utility: Redis | null = null
let _pub: Redis | null = null
let _sub: Redis | null = null
const _dedicated: Array<Redis> = []

function make(label) {
    const connection = new IORedis(serverEnv.REDIS_CONNECTION_STRING, BASE_OPTIONS)

    return connection
}

export function createDedicatedConnection(label: string) {
    const connection = make(`dedicated:${label}`)
    _dedicated.push(connection)

    return connection
}

export const getWorkerConnection = () => _worker ??= make("worker")
export const getUtilityConnection = () => _utility ??= make("utility")
export const getPubConnection = () => _pub ??= make("pub")
export const getSubConnection = () => _sub ??= make("sub")

export const redisKeys = {
    signals: (jobId: string, source: string) => `job:${jobId}:signals:${source}`,
    signalCount: (jobId: string) => `job:${jobId}:signal_count`,
    jobLock: (jobId: string) => `job:${jobId}:lock`,
    aiCache: (key: string) => `ai:cache:${key}`,
    reportCache: (jobId: string) => `report:${jobId}`,
    progressChannel:  (jobId: string) => `job:${jobId}:progress`,
    domainExclusions:  (userId: string) => `user:${userId}:exclusions`,
    preprocessLock: (jobId: string, index: number) => `job:${jobId}:preprocess:${index}`
}