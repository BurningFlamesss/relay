import { getSessionMiddleware } from "#/middleware/auth.middleware.ts";
import { redeemCodeSchema } from "#/schema/billing.tsx"
import { createServerFn } from "@tanstack/react-start"

export const redeemCouponService = createServerFn()
    .middleware([getSessionMiddleware])
    .inputValidator(redeemCodeSchema)
    .handler(async ({ data, context }) => {
        const session = context.session

        if (!session) {
            throw new Error("Unauthorized")
        }

        const userId = session.user.id

        const { prisma } = await import("#/db.ts")

        return prisma.$transaction(async (tx) => {
            const coupon = await tx.coupon.findFirst({
                where: {
                    code: data.code,
                    status: "ACTIVE",
                },
            })

            if (!coupon) {
                throw new Error("Invalid coupon")
            }

            if (coupon.redemptionType !== "DIRECT_REDEEM") {
                throw new Error("Coupon requires checkout")
            }

            if (coupon.creditAmount == null) {
                throw new Error("Coupon has no redeemable credits")
            }

            const now = new Date()

            if (coupon.startsAt && coupon.startsAt > now) {
                throw new Error("Coupon not started")
            }

            if (coupon.expiresAt && coupon.expiresAt < now) {
                throw new Error("Coupon expired")
            }

            if (
                coupon.maxUses !== null &&
                coupon.usedCount >= coupon.maxUses
            ) {
                throw new Error("Coupon exhausted")
            }

            const redemptionCount = await tx.couponUsage.count({
                where: {
                    couponId: coupon.id,
                    userId,
                },
            })

            if (redemptionCount >= coupon.perUserLimit) {
                throw new Error("Redemption limit reached")
            }

            const wallet = await tx.creditWallet.findUnique({
                where: {
                    userId,
                },
            })

            if (!wallet) {
                throw new Error("Wallet not found")
            }

            const newBalance = wallet.balance + coupon.creditAmount

            await tx.creditWallet.update({
                where: {
                    userId,
                },
                data: {
                    balance: {
                        increment: coupon.creditAmount,
                    },
                    lifetimeEarned: {
                        increment: coupon.creditAmount,
                    },
                },
            })

            await tx.couponUsage.create({
                data: {
                    userId,
                    couponId: coupon.id,
                    creditsGranted: coupon.creditAmount,
                },
            })

            await tx.coupon.update({
                where: {
                    id: coupon.id,
                },
                data: {
                    usedCount: {
                        increment: 1,
                    },
                },
            })

            await tx.creditTransaction.create({
                data: {
                    userId,
                    type: "COUPON",
                    amount: coupon.creditAmount,
                    balanceAfter: newBalance,
                    reservedAfter: wallet.reserved,
                    description: `Redeemed ${coupon.code}`,
                    referenceId: coupon.id,
                    source: "COUPON_REDEMPTION",
                },
            })

            return {
                success: true,
                credits: coupon.creditAmount,
            }
        }, {
            isolationLevel: "Serializable"
        })
    })