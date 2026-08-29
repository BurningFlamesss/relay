import { getUtilityConnection } from "#/core/redis.ts";

const WINDOW_MS = 60000
const MAX_PER_WINDOW = 50

const LUA = `
    local key = KEYS[1]
    local ttl = tonumber(ARGV[1])
    local count = redis.call('INCR', key)
    if count == 1 then redis.call('EXPIRE', key, ttl) end
    return count
`

export async function acquireRateLimit(taskType: string): Promise<void> {
    const redis = getUtilityConnection()
    const windowKey = Math.floor(Date.now() / WINDOW_MS)
    const key = `ai:ratelimit:${taskType}:${windowKey}`
    const ttlSecond = Math.ceil(WINDOW_MS / 1000) + 5

    const count = (await redis.eval(LUA, 1, key, String(ttlSecond))) as number

    if (count > MAX_PER_WINDOW) {
        const retryInMs = WINDOW_MS - (Date.now() % WINDOW_MS)

        throw new Error(
            `Rate limit exceeded for ${taskType} (${count}/${MAX_PER_WINDOW}) - retry in ${Math.ceil(retryInMs / 1000)}s`
        )
    }
}