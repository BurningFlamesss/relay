import { getSessionMiddleware } from "#/middleware/auth.middleware.ts"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

export const testHealthFn = createServerFn()
    .validator(z.object({ test: z.string().optional() }))
    .handler(async ({ data }) => {
        return {
            status: "ok",
            message: "Server functions working",
            timestamp: new Date().toISOString(),
            received: data.test
        }
    })

export const testDbFn = createServerFn()
    .middleware([getSessionMiddleware])
    .handler(async ({ context }) => {
        const { prisma } = await import("#/db.ts")
        const count = await prisma.user.count()
        return {
            status: "ok",
            userCount: count,
            authenticated: !!context.session
        }
    })

export const testRedisFn = createServerFn()
    .middleware([getSessionMiddleware])
    .handler(async () => {
        const { connection } = await import("#/core/connection.ts")
        const pong = await connection.ping()
        return {
            status: "ok",
            redis: pong
        }
    })

export const testQueueFn = createServerFn()
    .middleware([getSessionMiddleware])
    .handler(async () => {
        const { analyzeQueue } = await import("#/core/queues.ts")
        const counts = await Promise.all([
            analyzeQueue.getWaitingCount(),
            analyzeQueue.getActiveCount(),
            analyzeQueue.getCompletedCount(),
            analyzeQueue.getFailedCount()
        ])
        return {
            status: "ok",
            queues: {
                waiting: counts[0],
                active: counts[1],
                completed: counts[2],
                failed: counts[3]
            }
        }
    })