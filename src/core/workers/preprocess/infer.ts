import type { AuthorType } from "#/core/types.ts";
import { ensureModel } from "./model";

export interface InferResult {
    authorType: AuthorType;
    intensityScore: number;
    isDemandSignal: boolean;
}

interface SignalForInference {
    id: string;
    quote: string;
    title?: string | null;
    authorHandle?: string | null;
    source: string;
}

const MODEL_BATCH_SIZE = 12

const SYSTEM_PROMPT = `

`

export async function inferBatch(signals: Array<SignalForInference>): Promise<Array<InferResult>> {
    await ensureModel()

    const results: InferResult[] = new Array(signals.length)
    const subBatches: Array<Array<{ signal: SignalForInference; index: number }>> = []

    for (let index = 0; index < signals.length; index += MODEL_BATCH_SIZE) {
        subBatches.push(
            signals.slice(index, index + MODEL_BATCH_SIZE).map((signal, jIndex) => ({
                signal,
                index: jIndex
            }))
        )
    }

    for (const batch of subBatches) {
        const userPrompt = batch.map(({ signal }, number) => `
            Signal ${number + 1}: \n
            Source: ${signal.source} \n
            Handle: ${signal.authorHandle ?? "unknown"} \n
            Title: ${signal.title ?? ""} \n
            Quote: ${signal.quote.slice(0, 500)}
            `
        ).join("\n\n")

        // TODO: Model call
    }

    return results
}