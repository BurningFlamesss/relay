import { z } from "zod";

export const authSearchParam = z.object({
    type: z.enum(["signin", "signup"]).catch("signup")
})

export const resetPasswordParam = z.object({
    token: z.string().optional().default("")
})

export const signinSchema = z.object({
    email: z.email(),
    password: z.string().min(8).max(100)
})

export const signupSchema = z.object({
    name: z.string().min(3).max(100),
    email: z.email(),
    password: z.string().min(8).max(100)
})