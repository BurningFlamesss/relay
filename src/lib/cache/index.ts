import { serverEnv } from "#/env/server.ts";
import type { Redis } from "ioredis";

let redis: Redis | null = null

try {
    const { default: Redis } = await import("ioredis")
    const connection = serverEnv.REDIS_CACHE_CONNECTION_STRING

    if (connection) {
        redis = new Redis(connection)
    }
} catch (error) {
    
}

type CacheEntry = { value: string, expiresAt: number }

const memoryCache = new Map<string, CacheEntry>()

function now() {
    return Date.now()
}

export async function cacheGet(key: string) {
    if (redis) {
        const value = redis.get(key)
        return value
    }

    const entry = memoryCache.get(key)
    if (!entry) return null

    if (entry.expiresAt < now()) {
        memoryCache.delete(key)
        return null
    }

    return entry.value
}

