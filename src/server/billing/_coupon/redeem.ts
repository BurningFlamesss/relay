import { getSessionMiddleware } from "#/middleware/auth.middleware.ts";
import { redeemCodeSchema } from "#/schema/billing.tsx"
import { createServerFn } from "@tanstack/react-start"

const MAX_ATTEMPTS = 3

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

        const { cacheDel } = await import("#/lib/cache")
        let attempt = 0

        while (true) {
            attempt++

            try {
                return await prisma.$transaction(async (tx) => {
                    const coupon = await tx.coupon.findUnique({
                        where: {
                            code: data.code
                        },
                        select: {
                            id: true,
                            code: true,
                            status: true,
                            redemptionType: true,
                            creditAmount: true,
                            maxUses: true,
                            usedCount: true,
                            perUserLimit: true,
                            startsAt: true,
                            expiresAt: true,
                            applicationCreditPackIds: true
                        }
                    })

                    if (!coupon) throw new Error("Invalid coupon")
                    if (coupon.status !== "ACTIVE") throw new Error("Coupon inactive")
                    if (coupon.redemptionType !== "DIRECT_REDEEM") throw new Error("Coupon requires checkout")
                    if (coupon.creditAmount == null) throw new Error("Coupon has no redeemable credits")

                    const now = new Date()

                    if (coupon.startsAt && coupon.startsAt > now) throw new Error("Coupon not started")
                    if (coupon.expiresAt && coupon.expiresAt < now) throw new Error("Coupon expired")
                    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) throw new Error("Coupon exhausted")


                    const redemptionCount = await tx.couponUsage.count({
                        where: { couponId: coupon.id, userId },
                    })

                    if (redemptionCount >= coupon.perUserLimit) {
                        throw new Error("Redemption limit reached")
                    }

                    const wallet = await tx.creditWallet.upsert({
                        where: { userId },
                        update: {
                            balance: { increment: coupon.creditAmount },
                            lifetimeEarned: { increment: coupon.creditAmount },
                        },
                        create: {
                            userId,
                            balance: coupon.creditAmount,
                            reserved: 0,
                            lifetimeEarned: coupon.creditAmount,
                            lifetimeSpent: 0,
                        },
                        select: { balance: true, reserved: true }
                    })

                    await tx.couponUsage.create({
                        data: { userId, couponId: coupon.id, creditsGranted: coupon.creditAmount },
                    })

                    await tx.coupon.update({
                        where: { id: coupon.id },
                        data: { usedCount: { increment: 1 } },
                    })

                    await tx.creditTransaction.create({
                        data: {
                            userId,
                            type: "COUPON",
                            amount: coupon.creditAmount,
                            balanceAfter: wallet.balance,
                            reservedAfter: wallet.reserved,
                            description: `Redeemed ${coupon.code}`,
                            referenceId: coupon.id,
                            source: "COUPON_REDEMPTION",
                        },
                    })


                    try {
                        await cacheDel(`wallet:${userId}`)
                    } catch (error) {

                    }

                    return {
                        success: true,
                        credits: coupon.creditAmount
                    }
                }, { isolationLevel: "ReadCommitted" })
            } catch (error: any) {
                const message = String(error?.message || error)

                if (attempt < MAX_ATTEMPTS && /transaction|serialize|start a transaction|could not obtain lock/i.test(message)) {
                    await new Promise(resolve => setTimeout(resolve, 50 * attempt))
                    continue
                }

                throw error
            }
        }

    })