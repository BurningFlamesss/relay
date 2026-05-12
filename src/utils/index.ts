export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export function formatPrice(amount: number, currency: string) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
    }).format(amount / 100)
}

export function estimateIdeas(creditAmount: number) {
    return Math.ceil(creditAmount / 10)
}