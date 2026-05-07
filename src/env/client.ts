import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const clientEnv = createEnv({
    clientPrefix: 'VITE_',

    client: {
        VITE_APP_URL: z.url(),
        VITE_POSTHOG_KEY: z.string().optional(),
        VITE_POSTHOG_HOST: z.string().optional()
    },

    runtimeEnv: import.meta.env,

    emptyStringAsUndefined: true,

    onValidationError(issues) {
        console.error("Invalid Environment Variable")
        issues.forEach(issue => console.error(`  ${issue.path?.join('.')}: ${issue.message}`))
        process.exit(1)
    },

})
