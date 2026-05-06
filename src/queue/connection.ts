import { Redis } from "ioredis";

export const connection = new Redis(process.env.REDIS_CONNECTION_STRING!, {
    maxRetriesPerRequest: null
})

export const createSubscriber = () => new Redis(process.env.REDIS_CONNECTION_STRING!, {
    maxRetriesPerRequest: null
})