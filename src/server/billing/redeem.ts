import { redeemCodeSchema } from "#/schema/billing.tsx";
import { createServerFn } from "@tanstack/react-start"

export const redeemCouponService = createServerFn()
    .inputValidator(redeemCodeSchema)
    .handler(async ({ data: { code, userId } }) => {
        const { prisma } = await import("#/db.ts")
        const coupon = await prisma.coupon.findUnique({
            where: {
                code: code,
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
                    userId: userId,
                },
            },
        })

        if (alreadyRedeemed) {
            throw new Error("Already redeemed")
        }

        return prisma.$transaction(async (tx) => {
            const wallet = await tx.creditWallet.findUnique({
                where: { userId: userId },
            })

            if (!wallet) throw new Error("Wallet not found")

            const newBalance = wallet.balance + (coupon.creditAmount ?? 0)

            await tx.creditWallet.update({
                where: { userId: userId },
                data: {
                    balance: newBalance,
                    lifetimeEarned: { increment: (coupon.creditAmount ?? 0) },
                },
            })

            await tx.couponUsage.create({
                data: {
                    userId: userId,
                    couponId: coupon.id,
                    creditsGranted: coupon.creditAmount,
                },
            })

            await tx.creditTransaction.create({
                data: {
                    userId: userId,
                    type: "COUPON",
                    amount: (coupon.creditAmount ?? 0),
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
    })