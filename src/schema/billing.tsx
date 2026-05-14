import { z } from "zod"

export const redeemCodeSchema = z.object({
    code: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .transform((value) => value.toUpperCase()),
})