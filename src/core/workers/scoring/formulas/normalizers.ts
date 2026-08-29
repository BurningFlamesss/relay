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