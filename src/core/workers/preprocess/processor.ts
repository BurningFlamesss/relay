import type { AuthorType, PreprocessBatchResult, PreprocessJobData } from "#/core/types.ts";
import { prisma } from "#/db.ts";
import type { Job } from "bullmq";
import { applyRules } from "./rules";
import { inferBatch } from "./infer";

interface ClassifiedSignal {
    id: string;
    authorType: AuthorType;
    intensityScore: number;
    isDemandSignal: boolean;
}

export async function processPreprocessBatch(job: Job<PreprocessJobData>): Promise<PreprocessBatchResult> {
    const { jobId, signalIds, batchIndex, totalBatches } = job.data

    await job.updateProgress({
        message: `Preprocessing batch ${batchIndex + 1}/${totalBatches} (${signalIds.length} signals)`
    })

    const signals = await prisma.signal.findMany({
        where: {
            id: {
                in: signalIds
            }
        },
        select: {
            id: true,
            quote: true,
            authorHandle: true,
            source: true,
            title: true
        }
    })

    if (signals.length === 0) {
        return {
            processed: 0,
            demandSignalsFound: 0,
            batchIndex
        }
    }

    const classified: Array<ClassifiedSignal> = []

    const needsModel: Array<{ signal: typeof signals[0]; index: number }> = []

    for (let index = 0; index < signals.length; index++) {
        const rule = applyRules(signals[index])

        if (rule.confident) {
            classified[index] = {
                id: signals[index].id,
                authorType: rule.authorType,
                intensityScore: rule.intensityScore,
                isDemandSignal: rule.isDemandSignal
            }
        } else {
            classified[index] = {
                id: signals[index].id,
                authorType: "UNKNOWN",
                intensityScore: 40,
                isDemandSignal: rule.isDemandSignal
            }

            needsModel.push({
                signal: signals[index],
                index
            })
        }
    }

    if (needsModel.length > 0) {
        const inferred = await inferBatch(needsModel.map((need) => need.signal))

        for (let jIndex = 0; jIndex < needsModel.length; jIndex++) {
            const { index } = needsModel[jIndex]
            classified[index] = {
                id: signals[index].id,
                ...inferred[jIndex]
            }
        }
    }

    await bulkUpdateSignals(classified)

    const demandSignalsFound = classified.filter((signal) => signal.isDemandSignal).length

    await job.updateProgress({
        message: `Batch ${batchIndex + 1} done - ${demandSignalsFound} demand signals`
    })

    return {
        processed: signals.length,
        demandSignalsFound,
        batchIndex
    }
}

async function bulkUpdateSignals(classified: Array<ClassifiedSignal>): Promise<void> {
    if (classified.length === 0) {
        return
    }

    try {
        const values = classified
            .map((signal) => `('${signal.id}', '${signal.authorType}', '${signal.intensityScore}', '${signal.isDemandSignal}')`)
            .join(", ")

        await prisma.$executeRawUnsafe(`
            UPDATE signal AS signal
            SET
                author_type = value.author_type::text::"AuthorType",
                intensity_score = value.intensity_score,
                is_demand_signal = value.is_demand_signal
            FROM (VALUES ${values}) AS value(id, author_type, intensity_score, is_demand_signal)
            WHERE signal.id = value.id
        `)
    } catch (error) {
        await prisma.$transaction(
            classified.map((signal) =>
                prisma.signal.update({
                    where: {
                        id: signal.id
                    },
                    data: {
                        authorType: signal.authorType,
                        intensityScore: signal.intensityScore,
                        isDemandSignal: signal.isDemandSignal
                    }
                }))
        )
    }
}