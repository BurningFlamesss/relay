export function norm(value: number, max: number): number {
    if (max === 0) {
        return 0
    }

    return Math.min(1, Math.max(0, value / max))
}

export function sigmoid(x: number, steepness = 0.01): number {
    return 1 / (1 + Math.exp(-steepness * x))
}

export function recencyScore(signals: Array<{ publishedAt: Date | null }>): number {
    if (signals.length === 0) {
        return 0
    }

    const now = Date.now()
    const scores = signals.map((signal) => {
        if (!signal.publishedAt) {
            return 0.3
        }

        const ageDays = (now - signal.publishedAt.getTime()) / 86_400_000

        return Math.exp(-ageDays / 180)
    })

    return scores.reduce((a, b) => a + b, 0) / scores.length
}

export function trendDirectionScore(direction: string | null): number {
    switch (direction) {
        case "rising":
            return 1.0

        case "stable":
            return 0.5

        case "declining":
            return 0.1

        default:
            return 0.3
    }
}

export function fundingScore(funding: Array<{ date?: string; amount?: number }> | null): number {
    if (!funding || funding.length === 0) {
        return 0.3
    }

    const now = Date.now()
    let score = 0

    for (const fund of funding) {
        if (!fund.date) {
            continue
        }

        const ageDays = (now - new Date(fund.date).getTime()) / 86_400_000
        const recencyWeight = Math.exp(-ageDays / 365)
        const amountWeight = fund.amount ? Math.min(1, fund.amount / 10_000_000) : 0.5

        score += recencyWeight * amountWeight
    }

    return Math.min(1, score)
}

export function round(number: number): number {
    return Math.round(number * 1000) / 1000
}