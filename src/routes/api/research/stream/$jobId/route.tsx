import { createFileRoute, redirect  } from "@tanstack/react-router"
import { getSessionMiddleware } from "#/middleware/auth.middleware.ts"
import { ResearchJobIdSchema } from "#/schema/research.tsx"
import { createServerFn } from "@tanstack/react-start"

export interface ResearchStreamEvent {
    // Human/system modified stage alias (for backwards compatibility)
    stage: string
    // Raw progress event fields passed through from the worker
    type?: string
    jobId?: string
    phase?: string
    message?: string
    progress?: number
    signalCount?: number
    iterationsDone?: number
    source?: string
    url?: string
    duration?: number
    error?: string
    metadata?: Record<string, unknown>
    data?: Record<string, unknown>
    timestamp: number
}

const getResearchStreamFn = createServerFn()
    .middleware([getSessionMiddleware])
    .inputValidator(ResearchJobIdSchema)
    .handler(async ({ data, context }) => {
        if (!context.session) {
            throw redirect({ to: "/authenticate", search: { type: "signup" } })
        }

        const { createSubscriber } = await import("#/core/connection")
        const { jobChannel } = await import("#/core/queues")
        const { prisma } = await import("#/db.ts")

        const job = await prisma.researchJob.findUnique({
            where: { id: data.jobId },
            select: { userId: true },
        })

        if (!job || job.userId !== context.session.user.id) {
            throw new Error("Job not found")
        }

        const subscriber = createSubscriber()
        const encoder = new TextEncoder()
        let closed = false

        const stream = new ReadableStream({
            async start(controller) {
                const send = (event: Record<string, unknown>) => {
                    if (closed) return
                    const stage =
                        (event.stage as string) ??
                        (event.type as string) ??
                        "update"
                    try {
                        controller.enqueue(
                            encoder.encode(
                                `id: ${stage}\ndata: ${JSON.stringify({ ...event, stage })}\n\n`
                            )
                        )
                    } catch {
                        // controller already closed
                    }
                }

                await subscriber.subscribe(jobChannel(data.jobId))

                subscriber.on("message", (_channel, message) => {
                    try {
                        const parsed = JSON.parse(message)

                        // Forward the full progress event so the client can show
                        // exactly which source/URL is being processed.
                        send({
                            ...parsed,
                            stage: parsed.stage ?? parsed.type ?? "update",
                        })

                        if (
                            parsed.stage === "completed" ||
                            parsed.stage === "failed" ||
                            parsed.type === "DONE" ||
                            parsed.type === "FATAL"
                        ) {
                            closed = true
                            subscriber.quit().catch(() => {})
                            try {
                                controller.close()
                            } catch {
                                // already closed
                            }
                        }
                    } catch {
                        send({
                            stage: "error",
                            message: "Malformed progress event",
                            timestamp: Date.now(),
                        })
                    }
                })

                // Send the current persisted stage immediately so a reloaded page
                // shows where the job is without waiting for the next event.
                const initialJob = await prisma.researchJob.findUnique({
                    where: { id: data.jobId },
                    select: { status: true, currentStage: true, iterationsDone: true },
                })

                if (initialJob) {
                    send({
                        stage: initialJob.currentStage?.toLowerCase() ?? "queued",
                        type: "SNAPSHOT",
                        message: initialJob.currentStage ?? "Starting...",
                        iterationsDone: initialJob.iterationsDone,
                        data: { iterationsDone: initialJob.iterationsDone },
                        timestamp: Date.now(),
                    })
                }
            },
        })

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        })
    })

export const Route = createFileRoute('/api/research/stream/$jobId')({
    server: {
        handlers: {
            GET: async ({ request, params }) => {
                return getResearchStreamFn({ data: params, context: request })
            }
        }
    }
})
