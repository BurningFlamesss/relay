import type { PhaseType } from "#/core/types.ts";
import { prisma } from "#/db.ts";

const completedPhasesCache = new Map<string, Set<PhaseType>>()
const phaseOutputCache = new Map<string, Map<PhaseType, unknown>>()

export async function updateResearchPhase(jobId: string, phase: PhaseType, status: "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED", options?: { output?: unknown; errorMessage?: string; summary?: string; }): Promise<void> {
    if (status === "COMPLETED" || status === "SKIPPED") {
        let set = completedPhasesCache.get(jobId)
        if (!set) {
            set = new Set()
            completedPhasesCache.set(jobId, set)
        }
        set.add(phase)
        
        if (options?.output !== undefined) {
            let outputMap = phaseOutputCache.get(jobId)
            if (!outputMap) {
                outputMap = new Map()
                phaseOutputCache.set(jobId, outputMap)
            }
            outputMap.set(phase, options.output)
        }
    }
}

export async function loadResearchCompletedPhases(jobId: string): Promise<Set<PhaseType>> {
    return completedPhasesCache.get(jobId) ?? new Set()
}

export async function loadResearchPhaseOutput<T>(jobId: string, phase: PhaseType): Promise<T> {
    const outputMap = phaseOutputCache.get(jobId)
    if (!outputMap || !outputMap.has(phase)) {
        throw new Error(`Checkpoint resume failed: phase ${phase} has no saved output for job ${jobId}`)
    }
    return outputMap.get(phase) as T
}

export function clearResearchPhaseCache(jobId: string): void {
    completedPhasesCache.delete(jobId)
    phaseOutputCache.delete(jobId)
}