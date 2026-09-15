import { createFileRoute } from "@tanstack/react-router"
import { prisma } from "#/db.ts"
import { researchQueue } from "#/core/queues.ts"
import crypto from "node:crypto"

export const Route = createFileRoute("/api/test-research")({
    server: {
        handlers: {
            POST: async ({ request }) => {
                try {
                    const contentEncoding = request.headers.get("content-encoding")
                    console.log("Content-Encoding:", contentEncoding)
                    let rawBody: string
                    if (contentEncoding === "gzip") {
                        const arrayBuffer = await request.arrayBuffer()
                        const decompressed = new DecompressionStream("gzip")
                            .decompress(new Response(arrayBuffer).body!)
                        rawBody = await new Response(decompressed).text()
                    } else {
                        rawBody = await request.text()
                    }
                    console.log("Raw body:", rawBody)
                    // Strip any leading non-JSON characters (BOM, etc.)
                    const cleanBody = rawBody.replace(/^[^{[]*/, '')
                    const body = JSON.parse(cleanBody)
                    const { question } = body as { question: string }

                    if (!question || question.length < 10) {
                        return Response.json({ error: "Question required (min 10 chars)" }, { status: 400 })
                    }

                    // Ensure test user exists
                    let testUser = await prisma.user.findUnique({ where: { id: "test-user" } })
                    if (!testUser) {
                        testUser = await prisma.user.create({
                            data: {
                                id: "test-user",
                                name: "Test User",
                                email: "test@test.com",
                                emailVerified: true,
                            },
                        })
                    }

                    // Use unique question by appending timestamp
                    const uniqueQuestion = `${question} ${Date.now()}`
                    const jobId = crypto.randomUUID()
                    const questionHash = crypto.createHash("sha256")
                        .update(uniqueQuestion.toLowerCase().trim())
                        .digest("hex")

                    await prisma.researchJob.create({
                        data: {
                            id: jobId,
                            userId: testUser.id,
                            question: uniqueQuestion,
                            questionHash,
                            depth: "QUICK",
                            maxIterations: 1,
                            maxSources: 3,
                            maxPages: 5,
                            status: "QUEUED",
                        },
                    })

                    await researchQueue.add(
                        `research:${jobId}`,
                        {
                            jobId,
                            userId: testUser.id,
                            topic: question,
                            topicHash: crypto.createHash("sha256").update(question.toLowerCase().trim()).digest("hex"),
                            tier: "HIGH",
                            maxIterations: 1,
                        },
                        {
                            jobId,
                            priority: 1,
                        }
                    )

                    return Response.json({ jobId, status: "queued" })
                } catch (error) {
                    console.error("Test research error:", error)
                    return Response.json({ error: "Internal error" }, { status: 500 })
                }
            },
            GET: async ({ request }) => {
                const url = new URL(request.url)
                const jobId = url.searchParams.get("jobId")

                if (!jobId) {
                    return Response.json({ error: "jobId required" }, { status: 400 })
                }

                const job = await prisma.researchJob.findUnique({
                    where: { id: jobId },
                    include: {
                        sources: true,
                        documents: true,
                        evidence: true,
                        findings: true,
                        report: true,
                    },
                })

                if (!job) {
                    return Response.json({ error: "Not found" }, { status: 404 })
                }

                return Response.json(job)
            }
        }
    }
})