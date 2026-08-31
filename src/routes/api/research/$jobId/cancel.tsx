import { createFileRoute } from "@tanstack/react-router"
import { cancelResearchFn } from "#/server/functions/research.tsx"

export const Route = createFileRoute('/api/research/$jobId/cancel')({
    server: {
        handlers: {
            POST: async ({ request, params }) => {
                return cancelResearchFn({ data: params, context: request })
            }
        }
    }
})