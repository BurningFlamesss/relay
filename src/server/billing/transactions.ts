export async function getRecentTransaction(userId: string) {
    const { prisma } = await import("#/db.ts")
    const { cacheGet, cacheSet } = await import("#/lib/cache")

    const cacheKey = `transaction:${userId}`

    try {
        const cached = await cacheGet(cacheKey)
        if (cached) {
            return JSON.parse(cached)
        }
    } catch (error) {
        
    }

    const transactions = prisma.creditTransaction.findMany({
        where: {
            userId
        },
        take: 20,
        skip: 0,
        orderBy: {
            createdAt: "desc"
        },
        select: {
            id: true,
            amount: true,
            type: true,
            description: true,
            createdAt: true
        }
    })

    try {
        await cacheSet(cacheKey, JSON.stringify(transactions), 5)
    } catch (error) {
        
    }

    return transactions
}