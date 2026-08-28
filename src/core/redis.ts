import { serverEnv } from "#/env/server.ts";
import { preprocess } from "better-auth";
import IORedis from "ioredis";
import type { Redis, RedisOptions } from "ioredis";
import { Signal } from "lucide-react";

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
    progressChannel: (jobId: string) => `job:${jobId}:progress`,
    domainExclusions: (userId: string) => `user:${userId}:exclusions`,
    preprocessLock: (jobId: string, index: number) => `job:${jobId}:preprocess:${index}`
}

export async function publishProgress(event) {
    await getPubConnection()
        .publish(redisKeys.progressChannel(event.jobId), JSON.stringify(event))
        .catch()
}

export async function bufferSignals(jobId: string, source: string, signals) {
    if (signals.length === 0) {
        return
    }

    const key = redisKeys.signals(jobId, source)
    const serialized = signals.map((signal) => JSON.stringify(signal))

    await getUtilityConnection()
        .pipeline()
        .rpush(key, ...serialized)
        .incrby(redisKeys.signalCount(jobId), signals.length)
        .expire(key, 7_200)
        .exec()
}

export async function drainSignalBuffer(jobId: string, source: string) {
    const key = redisKeys.signals(jobId, source)

    const results = await getUtilityConnection().pipeline().lrange(key, 0, -1).del(key).exec()

    if (!results) {
        return []
    }

    const [lrangeResult] = results
    const [error, items] = lrangeResult

    if (error) {
        return []
    }

    return ((items as Array<string>) ?? []).map((raw) => {
        try {
            return JSON.parse(raw)
        } catch (error) {
            return null
        }
    }).filter(signal => signal !== null)
} 