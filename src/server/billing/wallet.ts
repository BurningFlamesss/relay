export async function getWalletSummary(userId: string) {
    const { prisma } = await import("#/db.ts")
    return prisma.creditWallet.findUnique({
        where: {
            userId
        },
        select: {
            balance: true,
            reserved: true,
            lifetimeEarned: true,
            lifetimeSpent: true
        }
    })
}