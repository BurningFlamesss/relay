import type { Stage } from "#/hooks/useAnalysis.tsx";
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
                const lastStage = request.headers.get("Last-Event-ID")
                const encoder = new TextEncoder()

                // TODO: Verify the jobId matching the user requesting it (userId)

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

                        request.signal.addEventListener("abort", () => {
                            // TODO: Cancel any running jobs

                            controller.close()
                        })

                        try {
                            // TODO: subscribe to process worker
                            await delay(100)
                            send({ stage: "processing" })
                            await delay(200)
                            send({ stage: "confirmed" })
                            await delay(400)
                            send({ stage: "thinking" })
                            await delay(600)
                            send({ stage: "researching" })
                            await delay(800)
                            send({ stage: "evaluating" })
                            await delay(1000)
                            send({ stage: "stitching" })
                            await delay(1200)
                            send({ stage: "done", result: "No Data to show" })
                            
                        } catch (error) {
                            send({ stage: "error", error: "Pipeline failed" })
                            
                        } finally {
                            controller.close()
                        }

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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))