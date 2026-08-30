import type { PhaseContext } from "../context";
import { updatePhase } from "../phase-tracker";

export async function runMarketSizing(context: PhaseContext): Promise<void> {
    const { jobId, isDone } = context

    if (isDone("MARKET_SIZING")) {
        return
    }

    await context.progress("MARKET_SIZING", "Sizing the market...")
    await updatePhase(jobId, "MARKET_SIZING", "RUNNING")

    // TODO: Spawn market sizing scrapers
    // TODO: Call AI
    // TODO: Update IdeaCandidate

    await updatePhase(jobId, "MARKET_SIZING", "COMPLETED", {
        summary: "Community size, job postings, and funding signals collected"
    })

    await context.phaseDone("MARKET_SIZING", "Market data ready")
}