import { z } from "zod";

export const redeemCodeSchema = z.object({
    userId: z.string(),
    code: z.string()
})