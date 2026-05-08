import type { Stage } from "#/hooks/useAnalysis.tsx";
import { createSubscriber } from "#/lib/queue/connection.ts";
import { jobChannel } from "#/lib/queue/queues.ts";
import { createFileRoute } from "@tanstack/react-router";

export interface StreamEvent {
    stage: Stage;
    result?: any;
    error?: string;
}

export const Route = createFileRoute('/api/stream/$jobId')({
    server: {
        handlers: {
            GET: async ({ request, params }) => {
                const { jobId } = params
                const lastStage = request.headers.get("Last-Event-ID")
                const encoder = new TextEncoder()

                // TODO: Verify the jobId matching the user requesting it (userId)

                const subscriber = createSubscriber()

                const stream = new ReadableStream({
                    async start(controller) {
                        const send = (event: StreamEvent) => {

                            if (request.signal.aborted) return

                            controller.enqueue(
                                encoder.encode(
                                    `id: ${event.stage}\ndata: ${JSON.stringify(event)}\n\n`
                                )
                            )
                        }

                        await subscriber.subscribe(jobChannel(jobId))

                        subscriber.on("message", (channel, message) => {
                            try {
                                const parsed = JSON.parse(message)
                                send(parsed)

                                if (parsed.stage === "done" || parsed.stage === "error") {
                                    subscriber.quit()
                                    controller.close()
                                }
                            } catch (error) {
                                send({ stage: "error", error: "Malformed progress event" })
                                subscriber.quit()
                                controller.close()
                            }
                        })

                        request.signal.addEventListener("abort", () => {
                            // TODO: Cancel any running jobs
                            subscriber.quit()
                            controller.close()
                        })
                    }
                })

                return new Response(stream, {
                    headers: {
                        "Content-Type": "text/event-stream",
                        "Cache-Control": "no-cache",
                        "Connection": "keep-alive"
                    }
                })
            }
        }
    }
})