import { createFileRoute } from "@tanstack/react-router"
import { getResearchReportFn } from "#/server/functions/research.tsx"

export const Route = createFileRoute('/api/research/$jobId/report')({
    server: {
        handlers: {
            GET: async ({ request, params }) => {
                return getResearchReportFn({ data: params, context: request })
            }
        }
    }
})