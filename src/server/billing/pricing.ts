import type { CreditPackGetPayload } from './../../generated/prisma/models/CreditPack';
import { prisma } from "#/db.ts";

let cache: { data: Array<CreditPacksType>, expires: number } | undefined

type CreditPacksType = CreditPackGetPayload<{
    select: {
        credits: true,
        currency: true,
        name: true,
        price: true,
        id: true
    }
}>

const TTL = 1000 * 60 * 5

export async function getCreditPacks() {
    const now = Date.now()

    if (cache && cache.expires > now) {
        return cache.data
    }

    const packs = await prisma.creditPack.findMany({
        where: {
            isActive: true
        },
        orderBy: {
            sortOrder: "desc"
        },
        select: {
            credits: true,
            currency: true,
            name: true,
            price: true,
            id: true
        }
    })

    cache = {
        data: packs,
        expires: now + TTL
    }

    return packs
}