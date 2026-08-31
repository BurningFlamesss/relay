import { createFileRoute, redirect  } from "@tanstack/react-router"
import { getSessionMiddleware } from "#/middleware/auth.middleware.ts"
import { ResearchJobIdSchema } from "#/schema/research.tsx"
import { createServerFn } from "@tanstack/react-start"

export interface ResearchStreamEvent {
    stage: string
    message: string
    progress?: number
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

        const stream = new ReadableStream({
            async start(controller) {
                const send = (event: ResearchStreamEvent) => {
                    if (controller.signal?.aborted) return
                    controller.enqueue(
                        encoder.encode(
                            `id: ${event.stage}\ndata: ${JSON.stringify(event)}\n\n`
                        )
                    )
                }

                await subscriber.subscribe(jobChannel(data.jobId))

                subscriber.on("message", (_channel, message) => {
                    try {
                        const parsed = JSON.parse(message)
                        send({
                            stage: parsed.stage ?? parsed.type ?? "update",
                            message: parsed.message ?? "",
                            progress: parsed.progress,
                            data: parsed.data,
                            timestamp: parsed.timestamp ?? Date.now(),
                        })

                        if (parsed.stage === "completed" || parsed.stage === "failed" || parsed.type === "DONE" || parsed.type === "FATAL") {
                            subscriber.quit()
                            controller.close()
                        }
                    } catch {
                        send({
                            stage: "error",
                            message: "Malformed progress event",
                            timestamp: Date.now(),
                        })
                    }
                })

                const initialJob = await prisma.researchJob.findUnique({
                    where: { id: data.jobId },
                    select: { status: true, currentStage: true, iterationsDone: true },
                })

                if (initialJob) {
                    send({
                        stage: initialJob.currentStage?.toLowerCase() ?? "queued",
                        message: initialJob.currentStage ?? "Starting...",
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