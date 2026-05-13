import { prisma } from "#/db.ts";

export async function getWalletSummary(userId: string) {
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