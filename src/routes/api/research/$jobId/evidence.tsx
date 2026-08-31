import { createFileRoute } from "@tanstack/react-router"
import { getResearchEvidenceFn } from "#/server/functions/research.tsx"

export const Route = createFileRoute('/api/research/$jobId/evidence')({
    server: {
        handlers: {
            GET: async ({ request, params }) => {
                return getResearchEvidenceFn({ data: params, context: request })
            }
        }
    }
})