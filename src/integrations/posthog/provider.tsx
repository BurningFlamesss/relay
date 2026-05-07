import posthog from 'posthog-js'
import { PostHogProvider as BasePostHogProvider } from '@posthog/react'
import type { ReactNode } from 'react'
import { clientEnv } from '#/env/client.ts';

if (typeof window !== 'undefined' && clientEnv.VITE_POSTHOG_KEY) {
  posthog.init(clientEnv.VITE_POSTHOG_KEY, {
    api_host: clientEnv.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false,
    defaults: '2025-11-30',
  })
}

interface PostHogProviderProps {
  children: ReactNode
}

export default function PostHogProvider({ children }: PostHogProviderProps) {
  return <BasePostHogProvider client={posthog}>{children}</BasePostHogProvider>
}
