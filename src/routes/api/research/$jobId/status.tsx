import { createFileRoute } from "@tanstack/react-router"
import { getResearchStatusFn } from "#/server/functions/research.tsx"

export const Route = createFileRoute('/api/research/$jobId/status')({
    server: {
        handlers: {
            GET: async ({ request, params }) => {
                return getResearchStatusFn({ data: params, context: request })
            }
        }
    }
})