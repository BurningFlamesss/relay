import { serverEnv } from "#/env/server.ts";
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

export const getUtilityConnection = () => _utility ??= make("utility")