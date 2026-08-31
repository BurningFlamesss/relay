import { createFileRoute } from "@tanstack/react-router"
import * as researchFns from "#/server/functions/research.tsx"

export const Route = createFileRoute('/api/research/')({
    server: {
        handlers: {
            POST: async ({ request }) => {
                return researchFns.startResearchFn({ request })
            },
            GET: async ({ request }) => {
                return researchFns.getUserResearchJobsFn({ request })
            }
        }
    }
})