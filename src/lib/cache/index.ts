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

export async function cacheGet(key: string, localOnly: boolean = false) {
    if (!localOnly && redis) {
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

export async function cacheSet(key: string, value: string, ttlSeconds: number = 5, localOnly: boolean = false) {
    if (!localOnly && redis) {
        await redis.set(key, value, "EX", ttlSeconds)
        return
    }

    memoryCache.set(key, { value, expiresAt: now() + ttlSeconds * 1000 })
}

export async function cacheDel(key: string, localOnly: boolean = false) {
    if (!localOnly && redis) {
        await redis.del(key)
        return
    }

    memoryCache.delete(key)
}

export default { cacheSet, cacheGet, cacheDel }