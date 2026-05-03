import z from "zod";

export const AnalyzeSchema = z.object({
    topic: z.string().min(3).max(1000),
})