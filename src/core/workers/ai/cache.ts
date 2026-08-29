import { getUtilityConnection, redisKeys } from "#/core/redis.ts";
import { AI_CACHE_TTL_SECONDS } from "#/core/types.ts";

export async function getCached(cacheKey: string) {
    if (!cacheKey) {
        return null
    }

    try {
        const raw = await getUtilityConnection().get(redisKeys.aiCache(cacheKey))

        return raw ? (JSON.parse(raw)) : null
    } catch (error) {
        return null
    }
}

export async function setCache(cacheKey: string | undefined, value: unknown) {
    if (!cacheKey) {
        return
    }

    await getUtilityConnection()
        .setex(redisKeys.aiCache(cacheKey), AI_CACHE_TTL_SECONDS, JSON.stringify(value))
        .catch(() => { })
}