import { prisma } from "#/db.ts";

export async function getRecentTransaction(userId: string) {
    return prisma.creditTransaction.findMany({
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
}