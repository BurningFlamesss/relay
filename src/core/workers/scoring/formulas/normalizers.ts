export function norm(value: number, max: number): number {
    if (max === 0) {
        return 0
    }

    return Math.min(1, Math.max(0, value / max))
}

export function sigmoid(x: number, steepness = 0.01): number {
    return 1 / (1 + Math.exp(-steepness * x))
}

