export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export function formatPrice(amount: number, currency: string) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
    }).format(amount / 100)
}

export function estimateIdeas(credits: number) {
    return Math.ceil(credits / 10)
}