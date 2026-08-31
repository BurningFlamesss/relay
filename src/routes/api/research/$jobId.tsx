import { createFileRoute } from "@tanstack/react-router"
import { getResearchJobFn } from "#/server/functions/research.tsx"

export const Route = createFileRoute('/api/research/$jobId')({
    server: {
        handlers: {
            GET: async ({ request, params }) => {
                return getResearchJobFn({ data: params, context: request })
            }
        }
    }
})