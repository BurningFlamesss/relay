import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { prisma } from "#/db.ts"
import crypto from "node:crypto"
import { researchQueue } from "#/core/queues.ts"
import type { ResearchJobData } from "#/core/queues.ts"
import { getSessionMiddleware } from "#/middleware/auth.middleware.ts"
import { redirect } from "@tanstack/react-router"

const TestResearchRequestSchema = z.object({
    question: z.string().min(10).max(5000),
    depth: z.enum(["QUICK", "STANDARD", "DEEP"]).default("QUICK"),
    maxIterations: z.number().int().positive().max(2).default(1),
    maxSources: z.number().int().positive().max(10).default(3),
    maxPages: z.number().int().positive().max(20).default(3),
})

export const testStartResearchFn = createServerFn()
    .middleware([getSessionMiddleware])
    .inputValidator(TestResearchRequestSchema)
    .handler(async ({ data, context }) => {
        if (!context.session) {
            throw redirect({ to: "/authenticate", search: { type: "signup" } })
        }

        const jobId = crypto.randomUUID()
        const questionHash = crypto.createHash("sha256")
            .update(data.question.toLowerCase().trim())
            .digest("hex")

        await prisma.researchJob.create({
            data: {
                id: jobId,
                userId: context.session.user.id,
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
                userId: context.session.user.id,
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

export const testGetResearchJobFn = createServerFn()
    .middleware([getSessionMiddleware])
    .inputValidator(z.object({ jobId: z.string().min(1, "Job ID is required") }))
    .handler(async ({ data, context }) => {
        if (!context.session) {
            throw redirect({ to: "/authenticate", search: { type: "signup" } })
        }

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
        if (job.userId !== context.session.user.id) return null

        return job
    })

export const testResearchPollFn = createServerFn()
    .middleware([getSessionMiddleware])
    .inputValidator(z.object({ jobId: z.string().min(1, "Job ID is required") }))
    .handler(async ({ data, context }) => {
        if (!context.session) {
            throw redirect({ to: "/authenticate", search: { type: "signup" } })
        }

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

        if (!job) return null
        if (job.userId !== context.session.user.id) return null

        return job
    })