import { serverEnv } from "#/env/server.ts";
import { Redis } from "ioredis";

const connectionString = serverEnv.REDIS_CONNECTION_STRING

if (!connectionString) {
    throw new Error("REDIS_CONNECTION_STRING isnot set")
}

const redisOptions = connectionString.startsWith("rediss://")
    ? { tls: { rejectUnauthorized: false } }
    : {}

export const connection = new Redis(connectionString, {
    maxRetriesPerRequest: null,
    ...redisOptions
})

export const createSubscriber = () => new Redis(connectionString, {
    maxRetriesPerRequest: null,
    ...redisOptions
})