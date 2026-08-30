import type { SynthesisResult } from "#/core/types.ts";

export async function handleSynthesis(payload: Record<string, unknown>, _job: {
    updateProgress: (value: unknown) => Promise<void>
}): Promise<SynthesisResult> {

    // TODO: Implement AI

    return {
        problemStatement: "",
        targetPersona: "",
        solutionHypothesis: "",
        mvpScope: "",
        differentiationAngle: "",
        goToMarketChannel: "",
        riskFactors: [],
        confidenceLevels: {}
    }
}