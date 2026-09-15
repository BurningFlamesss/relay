import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { prisma } from "#/db.ts"
import crypto from "node:crypto"
import { researchQueue } from "#/core/queues.ts"
import type { ResearchJobData } from "#/core/queues.ts"

const TestResearchRequestSchema = z.object({
    question: z.string().min(10).max(5000),
    depth: z.enum(["QUICK", "STANDARD", "DEEP"]).default("QUICK"),
    maxIterations: z.number().int().positive().max(2).default(1),
    maxSources: z.number().int().positive().max(10).default(3),
    maxPages: z.number().int().positive().max(20).default(3),
})

export const publicTestStartResearchFn = createServerFn()
    .inputValidator(TestResearchRequestSchema)
    .handler(async ({ data }) => {
        const jobId = crypto.randomUUID()
        const questionHash = crypto.createHash("sha256")
            .update(data.question.toLowerCase().trim())
            .digest("hex")

        await prisma.researchJob.create({
            data: {
                id: jobId,
                userId: "test-user",
                question: data.question,
                questionHash,
                depth: data.depth,
                maxIterations: data.maxIterations,
                maxSources: data.maxSources,
                maxPages: data.maxPages,
                status: "QUEUED",
            },
        })

        await researchQueue.add(
            `research:${jobId}`,
            {
                jobId,
                userId: "test-user",
                topic: data.question,
                topicHash: crypto.createHash("sha256").update(data.question.toLowerCase().trim()).digest("hex"),
                tier: "HIGH",
                maxIterations: data.maxIterations,
                filters: data.constraints,
            },
            {
                jobId,
                priority: 1,
            }
        )

        return { jobId }
    })

export const publicTestGetResearchJobFn = createServerFn()
    .inputValidator(z.object({ jobId: z.string().min(1, "Job ID is required") }))
    .handler(async ({ data }) => {
        const job = await prisma.researchJob.findUnique({
            where: { id: data.jobId },
            include: {
                sources: true,
                documents: true,
                evidence: true,
                findings: true,
                report: true,
            },
        })

        if (!job) return null

        return job
    })

export const publicTestResearchPollFn = createServerFn()
    .inputValidator(z.object({ jobId: z.string().min(1, "Job ID is required") }))
    .handler(async ({ data }) => {
        const job = await prisma.researchJob.findUnique({
            where: { id: data.jobId },
            select: {
                id: true,
                status: true,
                currentStage: true,
                iterationsDone: true,
                errorMessage: true,
                createdAt: true,
                updatedAt: true,
                completedAt: true,
            },
        })

        return job
    })