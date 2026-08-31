import z from "zod"

export const ResearchRequestSchema = z.object({
    question: z.string().min(10).max(5000),
    depth: z.enum(["QUICK", "STANDARD", "DEEP"]).default("STANDARD"),
    maxIterations: z.number().int().positive().max(5).optional(),
    maxSources: z.number().int().positive().max(50).optional(),
    maxPages: z.number().int().positive().max(200).optional(),
    constraints: z.object({
        freshnessDays: z.number().int().positive().optional(),
        requiredCategories: z.array(z.string()).optional(),
        excludedDomains: z.array(z.string()).optional(),
        preferredSources: z.array(z.string()).optional(),
        language: z.string().optional(),
        region: z.string().optional(),
    }).optional(),
})

export const ResearchJobIdSchema = z.object({
    jobId: z.string().cuid(),
})

export type ResearchRequest = z.infer<typeof ResearchRequestSchema>
export type ResearchJobId = z.infer<typeof ResearchJobIdSchema>