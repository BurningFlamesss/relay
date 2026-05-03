import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute('/api/stream/$jobId')({
    server: {
        handlers: {
            GET: async ({ request, params }) => {
                const lastStage = request.headers.get("Last-Event-ID")
                const encoder = new TextEncoder()

                const stream = new ReadableStream({
                    async start(controller) {
                        const send = (stage: string, meta?: object) => {
                            controller.enqueue(
                                encoder.encode(
                                    `id: ${stage}\ndata: ${JSON.stringify({ stage, ...meta })}\n\n`
                                )
                            )
                        }

                        // TODO: subscribe to process worker
                        send("Analyzing")
                        await new Promise((resolve) => setTimeout(resolve, 500))
                        send("Confirmed")
                        await new Promise((resolve) => setTimeout(resolve, 500))
                        send("done", { result: "Finished" })

                        controller.close()
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