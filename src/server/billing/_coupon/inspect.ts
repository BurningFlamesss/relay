import { getSessionMiddleware } from "#/middleware/auth.middleware.ts";
import { redeemCodeSchema } from "#/schema/billing.tsx";
import { createServerFn } from "@tanstack/react-start";

type InspectResult = {
    valid: boolean;
    redeemable: boolean;
    reason?: string;
    redemptionType?: "DIRECT_REDEEM" | "CHECKOUT";
    remainingUses?: number;
    perUserRemaining?: number;
    creditsPreview?: number | null;
    applicablePacks?: Array<{
        id: string;
        name: string;
        creditAmount: number;
        price: number;
        currency: string;
    }>
}

export const inspectCouponServer = createServerFn()
    .middleware([getSessionMiddleware])
    .inputValidator(redeemCodeSchema)
    .handler(async ({ data, context }): Promise<InspectResult> => {
        const session = context.session

        if (!session) {
            return {
                valid: false,
                redeemable: false,
                reason: "Unauthorized"
            }
        }

        const userId = session.user.id
        const { prisma } = await import("#/db.ts")

        const now = Date.now()
        const cached = getCachedCoupon(data.code, now)
        const coupon = cached ?? await prisma.coupon.findUnique({
            where: {
                code: data.code
            },
            select: {
                id: true,
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

        if (coupon) {
            setCachedCoupon(data.code, coupon, now)
        }

        if (!coupon) {
            return {
                valid: false,
                redeemable: false,
                reason: "No coupon found"
            }
        }

        const nowDate = new Date(now)

        if (coupon.status !== "ACTIVE") {
            return { valid: false, redeemable: false, reason: "Coupon inactive" }
        }

        if (coupon.startsAt && coupon.startsAt > nowDate) {
            return { valid: false, redeemable: false, reason: "Coupon not started" }
        }

        if (coupon.expiresAt && coupon.expiresAt < nowDate) {
            return { valid: false, redeemable: false, reason: "Coupon expired" }
        }

        if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
            return { valid: false, redeemable: false, reason: "Coupon exhausted" }
        }

        const redemptionCount = await prisma.couponUsage.count({
            where: {
                couponId: coupon.id,
                userId
            }
        })

        if (redemptionCount >= coupon.perUserLimit) {
            return {
                valid: true,
                redeemable: false,
                reason: "Redemption limit reached"
            }
        }

        const remainingUses = coupon.maxUses === null ? undefined : Math.max(0, coupon.maxUses - coupon.usedCount)
        const perUserRemaining = Math.max(0, coupon.perUserLimit - redemptionCount)

        let applicablePacks: InspectResult["applicablePacks"] = []

        if (coupon.applicationCreditPackIds.length > 0) {
            const packs = await prisma.creditPack.findMany({
                where: { id: { in: coupon.applicationCreditPackIds }, isActive: true },
                select: { id: true, name: true, creditAmount: true, price: true, currency: true },
            })
            applicablePacks = packs.map(pack => ({
                ...pack,
                currency: String(pack.currency)
            }))
        }

        const redeemable = coupon.redemptionType === "DIRECT_REDEEM" && coupon.creditAmount != null

        return {
            valid: true,
            redeemable,
            redemptionType: "DIRECT_REDEEM",
            applicablePacks,
            creditsPreview: coupon.creditAmount ?? null,
            perUserRemaining,
            remainingUses
        }
    })


type CachedCoupon = {
    id: string
    status: string
    redemptionType: "DIRECT_REDEEM" | "CHECKOUT"
    creditAmount: number | null
    maxUses: number | null
    usedCount: number
    perUserLimit: number
    startsAt: Date | null
    expiresAt: Date | null
    applicationCreditPackIds: Array<string>
}



const couponCache = new Map<string, { value: CachedCoupon; expiresAt: number }>()
const COUPON_CACHE_TTL_MS = 30_000

function getCachedCoupon(code: string, now: number) {
    const entry = couponCache.get(code)
    if (!entry) return null
    if (entry.expiresAt <= now) {
        couponCache.delete(code)
        return null
    }
    return entry.value
}

function setCachedCoupon(code: string, value: CachedCoupon, now: number) {
    couponCache.set(code, { value, expiresAt: now + COUPON_CACHE_TTL_MS })
}