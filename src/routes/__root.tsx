import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  Link,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

// import PostHogProvider from '../integrations/posthog/provider'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

import appCss from '../styles.css?url'

import GlobalProvider from '#/provider/GlobalProvider'
import { getSessionFn } from '#/middleware/auth.middleware.ts';
import type { MyRouterContext } from '#/types/router-context.ts';

export const Route = createRootRouteWithContext<MyRouterContext>()({
  async beforeLoad() {
    const session = await getSessionFn()
    return { session }
  },
  notFoundComponent: () => {
    return (
      <div>
        <p>This is the notFoundComponent configured on root route</p>
        <Link to="/">Start Over</Link>
      </div>
    )
  },
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Relay',
        "aria-description": "Relay is a semi-autonomous research analyst for developers. It analyzes user signals (pain points), clusters recurring problems into structured domains, and surfaces actionable MVP opportunities to build."
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {/* <PostHogProvider> */}
          <GlobalProvider>
            {children}
          </GlobalProvider>
          <TanStackDevtools
            config={{
              position: 'bottom-right',
            }}
            plugins={[
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
              TanStackQueryDevtools,
            ]}
          />
        {/* </PostHogProvider> */}
        <Scripts />
      </body>
    </html>
  )
}
