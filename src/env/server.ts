import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const serverEnv = createEnv({
    server: {
        DATABASE_URL: z.url(),
        BETTER_AUTH_URL: z.url(),
        BETTER_AUTH_SECRET: z.string().min(1),
        REDIS_CONNECTION_STRING: z.url(),
        REDIS_CACHE_CONNECTION_STRING: z.url().optional(),
        WORKER_TYPE: z.string(),
        WORKER_HEALTH_PORT: z.string(),
        NODE_ENV: z.enum(["development", "production"]).catch("development"),
        OPENROUTER_API_KEY: z.string().optional(),
        OPENROUTER_BASE_URL: z.url().default("https://openrouter.ai/api/v1"),
        CRAWL4AI_URL: z.url().default("http://localhost:11235"),
        CRAWL4AI_API_TOKEN: z.string().optional(),
        RESEARCH_MAX_ITERATIONS: z.coerce.number().int().positive().default(3),
        RESEARCH_MAX_SOURCES: z.coerce.number().int().positive().default(30),
        RESEARCH_MAX_PAGES: z.coerce.number().int().positive().default(100),
        RESEARCH_CRAWL_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
        RESEARCH_AI_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
    },

    runtimeEnv: process.env,

    emptyStringAsUndefined: true,

    onValidationError(issues) {
        console.error("Invalid Environment Variable")
        issues.forEach(issue => console.error(`  ${issue.path?.join('.')}: ${issue.message}`))
        process.exit(1)
    },
})
