import { createFileRoute } from "@tanstack/react-router"
import { getResearchSourcesFn } from "#/server/functions/research.tsx"

export const Route = createFileRoute('/api/research/$jobId/sources')({
    server: {
        handlers: {
            GET: async ({ request, params }) => {
                return getResearchSourcesFn({ data: params, context: request })
            }
        }
    }
})