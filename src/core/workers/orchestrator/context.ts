import type { AnalysisTier, OrchestratorJobData, PhaseType } from "#/core/types.ts";
import type { Job } from "bullmq";

export interface PhaseContext {
    jobId: string;
    userId: string;
    topic: string;
    topicHash: string;
    tier: AnalysisTier;
    maxIterations: number;
    filters?: OrchestratorJobData["filters"];
    job: Job<OrchestratorJobData>
    isDone: (phase: PhaseType) => boolean;
    refreshDone: () => Promise<void>;
    progress: (phase: PhaseType, message: string, extra?: Record<string, unknown>) => Promise<void>;
    phaseDone: (phase: PhaseType, message: string, extra?: Record<string, unknown>) => Promise<void>;
}