import type { CreditPackGetPayload } from './../../generated/prisma/models/CreditPack';
import { prisma } from "#/db.ts";
import type { MemoryCache } from './cache';
import { isCacheValid } from './cache';


export type CreditPacksType = CreditPackGetPayload<{
    select: {
        creditAmount: true,
        currency: true,
        name: true,
        price: true,
        id: true
    }
}>

const TTL = 1000 * 60 * 5

let pricingCache: MemoryCache<Array<CreditPacksType>> | undefined
let pending: Promise<Array<CreditPacksType>> | null = null

export async function getCreditPacks() {

    if (isCacheValid(pricingCache)) {
        return pricingCache!.data
    }

    if (pending) {
        return pending
    }

    pending = prisma.creditPack.findMany({
        where: {
            isActive: true
        },
        orderBy: {
            sortOrder: "asc"
        },
        select: {
            creditAmount: true,
            currency: true,
            name: true,
            price: true,
            id: true
        }
    })

    try {
        const packs = await pending
    
        pricingCache = {
            data: packs,
            expires: Date.now() + TTL
        }
        
        return packs
    } finally {
        pending = null
        
    }
}



export async function getBillingPack(packId: string) {
    return await prisma.creditPack.findFirst({
        where: {
            id: packId,
            isActive: true,
        },
        orderBy: {
            sortOrder: "asc"
        },
        select: {
            creditAmount: true,
            currency: true,
            name: true,
            price: true,
            id: true
        }
    })
}