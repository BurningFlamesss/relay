export async function getWalletSummary(userId: string) {
    const { prisma } = await import("#/db.ts")
    const { cacheGet, cacheSet } = await import("#/lib/cache")

    const cacheKey = `wallet:${userId}`

    try {
        const cached = await cacheGet(cacheKey)

        if (cached) {
            return JSON.parse(cached)
        }
    } catch (error) {

    }

    const wallet = prisma.creditWallet.upsert({
        where: {
            userId
        },
        update: {},
        create: {
            userId,
            balance: 0,
            reserved: 0,
            lifetimeEarned: 0,
            lifetimeSpent: 0,
        },
        select: {
            balance: true,
            lifetimeSpent: true
        }
    })

    try {
        await cacheSet(cacheKey, JSON.stringify(wallet), 5)
    } catch (error) {
        
    }

    return wallet
}