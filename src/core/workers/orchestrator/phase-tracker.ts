import type { PhaseType } from "#/core/types.ts";
import { prisma } from "#/db.ts";

export async function updatePhase(jobId: string, phase: PhaseType, status: "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED", options?: { output?: unknown; errorMessage?: string; summary?: string; }): Promise<void> {
    const now = new Date()

    await prisma.jobPhase.upsert({
        where: {
            jobId_phase: {
                jobId, phase
            }
        },
        create: {
            jobId,
            phase,
            status,
            output: options?.output,
            errorMessage: options?.errorMessage,
            summary: options?.summary,
            startedAt: status === "RUNNING" ? now : undefined,
            completedAt: status !== "RUNNING" ? now : undefined
        },
        update: {
            status,
            output: options?.output !== undefined ? (options.output) : undefined,
            errorMessage: options?.errorMessage,
            summary: options?.summary,
            completedAt: status !== "RUNNING" ? now : undefined
        }
    })
}

export async function loadCompletedPhases(jobId: string): Promise<Set<PhaseType>> {
    const rows = await prisma.jobPhase.findMany({
        where: {
            jobId,
            status: {
                in: ["COMPLETED", "SKIPPED"]
            }
        },
        select: {
            phase: true
        }
    })

    return new Set(rows.map((row) => row.phase as PhaseType))
}

export async function loadPhaseOutput(jobId: string, phase: PhaseType) {
    const row = await prisma.jobPhase.findUnique({
        where: {
            jobId_phase: {
                jobId, phase
            }
        },
        select: {
            output: true
        }
    })

    if (!row?.output) {
        throw new Error(`Checkpoint resume failed: phase ${phase} has no saved output for job ${jobId}`)
    }

    return row.output
}