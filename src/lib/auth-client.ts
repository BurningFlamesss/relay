import { clientEnv } from '#/env/client.ts';
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
    baseURL: clientEnv.VITE_APP_URL
})
