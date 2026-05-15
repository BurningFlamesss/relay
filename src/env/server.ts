import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const serverEnv = createEnv({
    server: {
        DATABASE_URL: z.url(),
        BETTER_AUTH_URL: z.url(),
        BETTER_AUTH_SECRET: z.string().min(1),
        REDIS_CONNECTION_STRING: z.url(),
        REDIS_CACHE_CONNECTION_STRING: z.url().optional(),
        NODE_ENV: z.enum(["development", "production"]).catch("development")
    },

    runtimeEnv: process.env,

    emptyStringAsUndefined: true,

    onValidationError(issues) {
        console.error("Invalid Environment Variable")
        issues.forEach(issue => console.error(`  ${issue.path?.join('.')}: ${issue.message}`))
        process.exit(1)
    },
})
