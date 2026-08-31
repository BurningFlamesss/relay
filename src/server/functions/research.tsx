import { getSessionMiddleware } from "#/middleware/auth.middleware.ts"
import { ResearchRequestSchema, ResearchJobIdSchema } from "#/schema/research.tsx"
import { createServerFn } from "@tanstack/react-start"
import { redirect } from "@tanstack/react-router"
import { prisma } from "#/db.ts"
import { crypto } from "node:crypto"
import { researchQueue } from "#/core/queues.ts"
import type { ResearchJobData } from "#/core/queues.ts"

export const startResearchFn = createServerFn()
    .middleware([getSessionMiddleware])
    .inputValidator(ResearchRequestSchema)
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
                maxIterations: data.maxIterations ?? 3,
                maxSources: data.maxSources ?? 30,
                maxPages: data.maxPages ?? 100,
                status: "QUEUED",
            },
        })

        await researchQueue.add(
            `research:${jobId}`,
            {
                jobId,
                userId: context.session.user.id,
                topic: data.question,
                topicHash: questionHash,
                tier: "HIGH",
                maxIterations: data.maxIterations ?? 3,
                filters: data.constraints,
            },
            {
                jobId,
                priority: 1,
            }
        )

        return { jobId }
    })

export const getResearchJobFn = createServerFn()
    .middleware([getSessionMiddleware])
    .inputValidator(ResearchJobIdSchema)
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

export const getResearchStatusFn = createServerFn()
    .middleware([getSessionMiddleware])
    .inputValidator(ResearchJobIdSchema)
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

export const getResearchSourcesFn = createServerFn()
    .middleware([getSessionMiddleware])
    .inputValidator(ResearchJobIdSchema)
    .handler(async ({ data, context }) => {
        if (!context.session) {
            throw redirect({ to: "/authenticate", search: { type: "signup" } })
        }

        const job = await prisma.researchJob.findUnique({
            where: { id: data.jobId },
            select: { userId: true },
        })

        if (!job || job.userId !== context.session.user.id) return []

        return prisma.researchSource.findMany({
            where: { jobId: data.jobId },
            orderBy: { priority: "desc" },
        })
    })

export const getResearchEvidenceFn = createServerFn()
    .middleware([getSessionMiddleware])
    .inputValidator(ResearchJobIdSchema)
    .handler(async ({ data, context }) => {
        if (!context.session) {
            throw redirect({ to: "/authenticate", search: { type: "signup" } })
        }

        const job = await prisma.researchJob.findUnique({
            where: { id: data.jobId },
            select: { userId: true },
        })

        if (!job || job.userId !== context.session.user.id) return []

        return prisma.evidence.findMany({
            where: { jobId: data.jobId },
            include: {
                document: {
                    select: {
                        id: true,
                        url: true,
                        title: true,
                        domain: true,
                    },
                },
            },
            orderBy: { relevance: "desc" },
        })
    })

export const getResearchReportFn = createServerFn()
    .middleware([getSessionMiddleware])
    .inputValidator(ResearchJobIdSchema)
    .handler(async ({ data, context }) => {
        if (!context.session) {
            throw redirect({ to: "/authenticate", search: { type: "signup" } })
        }

        const job = await prisma.researchJob.findUnique({
            where: { id: data.jobId },
            select: { userId: true },
        })

        if (!job || job.userId !== context.session.user.id) return null

        return prisma.researchReport.findUnique({
            where: { jobId: data.jobId },
        })
    })

export const getUserResearchJobsFn = createServerFn()
    .middleware([getSessionMiddleware])
    .handler(async ({ context }) => {
        if (!context.session) {
            throw redirect({ to: "/authenticate", search: { type: "signup" } })
        }

        return prisma.researchJob.findMany({
            where: { userId: context.session.user.id },
            orderBy: { createdAt: "desc" },
            take: 50,
            select: {
                id: true,
                question: true,
                depth: true,
                status: true,
                currentStage: true,
                iterationsDone: true,
                createdAt: true,
                completedAt: true,
            },
        })
    })

export const cancelResearchFn = createServerFn()
    .middleware([getSessionMiddleware])
    .inputValidator(ResearchJobIdSchema)
    .handler(async ({ data, context }) => {
        if (!context.session) {
            throw redirect({ to: "/authenticate", search: { type: "signup" } })
        }

        const job = await prisma.researchJob.findUnique({
            where: { id: data.jobId },
            select: { userId: true, status: true },
        })

        if (!job || job.userId !== context.session.user.id) {
            throw new Error("Job not found")
        }

        if (job.status === "COMPLETED" || job.status === "FAILED" || job.status === "CANCELLED") {
            throw new Error("Job already finished")
        }

        await prisma.researchJob.update({
            where: { id: data.jobId },
            data: { status: "CANCELLED" },
        })

        return { success: true }
    })