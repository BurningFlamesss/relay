import { AnalyzeSchema } from "#/schema/analyze";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute('/api/stream/$jobId')({
    server: {
        handlers: {
            POST: async ({ request }) => {
                const body = await request.json()
                const result = AnalyzeSchema.safeParse(body)

                if (!result.success) {
                    return new Response(
                        JSON.stringify({ error: result.error.flatten().fieldErrors }),
                        {
                            status: 400,
                            headers: {
                                "Content-Type": "application/json"
                            }
                        }
                    )
                }


                const stream = new ReadableStream({
                    async start(controller) {
                        const send = (stage: string, meta?: object) => {
                            controller.enqueue(
                                `data: ${JSON.stringify({ stage, ...meta })}\n\n`
                            )
                        }

                        send("Processing")
                        send("Confirmed")
                        send("Completed", { result: "Finished" })

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