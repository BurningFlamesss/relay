export interface MemoryCache<T> {
    data: T,
    expires: number
}

export function isCacheValid(cache?: MemoryCache<unknown>) {
    if (!cache) return false

    return cache.expires > Date.now()
}