import { prisma } from "#/db.ts"

export async function redeemCouponService(input: {
    userId: string
    code: string
}) {
    const coupon = await prisma.coupon.findUnique({
        where: {
            code: input.code,
            status: "ACTIVE",
        },
    })

    if (!coupon) {
        throw new Error("Invalid coupon")
    }

    if (!coupon.creditAmount) {
        throw new Error("Coupon has no redeemable credits")
    }

    const alreadyRedeemed = await prisma.couponUsage.findUnique({
        where: {
            couponId_userId: {
                couponId: coupon.id,
                userId: input.userId,
            },
        },
    })

    if (alreadyRedeemed) {
        throw new Error("Already redeemed")
    }

    return prisma.$transaction(async (tx) => {
        const wallet = await tx.creditWallet.findUnique({
            where: { userId: input.userId },
        })

        if (!wallet) throw new Error("Wallet not found")

        const newBalance = wallet.balance + coupon.creditAmount

        await tx.creditWallet.update({
            where: { userId: input.userId },
            data: {
                balance: newBalance,
                lifetimeEarned: { increment: coupon.creditAmount },
            },
        })

        await tx.couponUsage.create({
            data: {
                userId: input.userId,
                couponId: coupon.id,
                creditsGranted: coupon.creditAmount,
            },
        })

        await tx.creditTransaction.create({
            data: {
                userId: input.userId,
                type: "COUPON",
                amount: coupon.creditAmount,
                balanceAfter: newBalance,
                reservedAfter: wallet.reserved,
                description: `Redeemed ${coupon.code}`,
            },
        })

        return {
            success: true,
            credits: coupon.creditAmount,
        }
    })
}