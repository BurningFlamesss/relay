import { createFileRoute } from "@tanstack/react-router"
import { prisma } from "#/db.ts"
import { createCrawlerService } from "#/core/crawler/service.ts"

export const Route = createFileRoute('/api/health')({
    server: {
        handlers: {
            GET: async () => {
                const checks = {
                    api: "ok" as const,
                    database: "unknown" as "ok" | "error" | "unknown",
                    openrouter: "unknown" as "configured" | "missing" | "unknown",
                    crawl4ai: "unknown" as "ok" | "error" | "unknown",
                }

                try {
                    await prisma.$queryRaw`SELECT 1`
                    checks.database = "ok"
                } catch {
                    checks.database = "error"
                }

                const openRouterKey = process.env.OPENROUTER_API_KEY
                checks.openrouter = openRouterKey ? "configured" : "missing"

                try {
                    const crawler = createCrawlerService()
                    const health = await crawler.checkHealth()
                    checks.crawl4ai = health.healthy ? "ok" : "error"
                } catch {
                    checks.crawl4ai = "error"
                }

                const overall = Object.values(checks).every(c => c === "ok" || c === "configured") ? "healthy" : "degraded"

                return new Response(JSON.stringify({
                    status: overall,
                    timestamp: new Date().toISOString(),
                    checks,
                }), {
                    headers: { "Content-Type": "application/json" },
                })
            }
        }
    }
})