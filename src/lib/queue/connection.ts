import { env } from "#/env.ts";
import { Redis } from "ioredis";

const connectionString = process.env.REDIS_CONNECTION_STRING

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