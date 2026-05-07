import { z } from "zod";

export const authSearchParam = z.object({
    type: z.enum(["signin", "signup"]).catch("signup")
})

