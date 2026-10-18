/**
 * End-to-end verification for the research pipeline.
 *
 * Creates a research job (with a backing DB record), enqueues it, then polls
 * the database and prints every status/stage transition until the job reaches a
 * terminal state. Use this to confirm that planning/crawling/extraction/etc. are
 * actually progressing (e.g. after changing the AI model configuration).
 *
 *   npx dotenv -e .env.local -- npx tsx scripts/verify-research.ts
 */
import crypto from "node:crypto"
import { prisma } from "#/db.ts"
import { researchQueue } from "#/core/queues.ts"

const POLL_INTERVAL_MS = 4000
const MAX_POLLS = 120 // ~8 minutes

async function main() {
    const question =
        process.argv[2] ??
        "What are the most common complaints developers have about Notion?"

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

    const jobId = crypto.randomUUID()
    const topicHash = crypto
        .createHash("sha256")
        .update(question.toLowerCase().trim())
        .digest("hex")

    await prisma.researchJob.create({
        data: {
            id: jobId,
            userId: testUser.id,
            question,
            questionHash: topicHash,
            depth: "QUICK",
            maxIterations: 1,
            maxSources: 3,
            maxPages: 3,
            status: "QUEUED",
        },
    })

    await researchQueue.add(
        `research:${jobId}`,
        {
            jobId,
            userId: testUser.id,
            topic: question,
            topicHash,
            tier: "HIGH",
            maxIterations: 1,
        },
        { jobId, priority: 1 }
    )

    console.log(`\n[job] ${jobId}`)
    console.log(`[job] question: ${question}\n`)

    const seen = new Set<string>()

    for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))

        const job = await prisma.researchJob.findUnique({
            where: { id: jobId },
            select: {
                status: true,
                currentStage: true,
                iterationsDone: true,
                errorMessage: true,
            },
        })

        if (!job) {
            console.log(`[${i}] job record disappeared`)
            break
        }

        const key = `${job.status}|${job.currentStage}`
        if (!seen.has(key)) {
            seen.add(key)
            console.log(
                `[${(i + 1) * (POLL_INTERVAL_MS / 1000)}s] status=${job.status} stage=${job.currentStage ?? "-"}`
            )
        }

        if (["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) {
            console.log(`\n[result] ${job.status}`)
            if (job.errorMessage) console.log(`[error] ${job.errorMessage}`)
            break
        }
    }

    const [sources, documents, evidence, findings] = await Promise.all([
        prisma.researchSource.count({ where: { jobId } }),
        prisma.researchDocument.count({ where: { jobId } }),
        prisma.evidence.count({ where: { jobId } }),
        prisma.researchFinding.count({ where: { jobId } }),
    ])

    console.log(
        `\n[counts] sources=${sources} documents=${documents} evidence=${evidence} findings=${findings}`
    )

    await prisma.$disconnect()
    process.exit(0)
}

main().catch(async (error) => {
    console.error(error)
    await prisma.$disconnect().catch(() => {})
    process.exit(1)
})
