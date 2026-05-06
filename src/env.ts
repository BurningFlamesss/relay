import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const env = createEnv({
  server: {
    SERVER_URL: z.string().url().optional(),
    REDIS_CONNECTION_STRING: z.string().min(1)
  },

  clientPrefix: 'VITE_',

  client: {},

  runtimeEnv: {
    SERVER_URL: process.env.SERVER_URL,
    REDIS_CONNECTION_STRING: process.env.REDIS_CONNECTION_STRING,
  },

  emptyStringAsUndefined: true,


  onValidationError(issues) {
    console.error("Invalid Environment Variable")
    issues.forEach(issue => console.error(`  ${issue.path?.join('.')}: ${issue.message}`))
    process.exit(1)
  },

})
