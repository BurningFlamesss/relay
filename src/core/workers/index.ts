import type { Worker } from "bullmq";
import { createOrchestratorWorker } from "./orchestrator";
import { createScraperWorker } from "./scraper";
import { createPreprocessWorker } from "./preprocess";
import { createAIWorker } from "./ai";
import { createScoringWorker } from "./scoring";
import { serverEnv } from "#/env/server.ts";
import { drainAndCloseQueues } from "../queues";
import { closeAllConnections } from "../redis";

const REGISTRY: Record<string, () => Worker> = {
    orchestrator: createOrchestratorWorker,
    scraper: createScraperWorker,
    preprocess: createPreprocessWorker,
    ai: createAIWorker,
    scoring: createScoringWorker
}

async function start(): Promise<void> {
    const type = serverEnv.WORKER_TYPE ?? "all"

    const workers: Array<Worker> = []

    if (type === "all") {
        console.log("[WORKERS] Starting all worker types in single process (dev mode)")

        for (const [name, factory] of Object.entries(REGISTRY)) {
            console.log(`[WORKERS] Starting: ${name}`)
            workers.push(factory())
        }
    } else {
        const factory = REGISTRY[type]

        if (!factory) {
            console.error(`[WORKERS] Unknown WORKER_TYPE "${type}". Valid: ${Object.keys(REGISTRY).join(", ")}`)
            process.exit(1)
        }

        console.log(`[WORKERS] Starting: ${type} (PID ${process.pid})`)
        workers.push(factory())
    }

    // TODO: Health check

    let stopping = false

    async function stop(signal: string): Promise<void> {
        if (stopping) {
            return
        }

        stopping = true

        console.log(`\n[WORKERS] ${signal} - draining in-flight jobs (max 30s)...`)

        const forced = setTimeout(() => {
            console.error("[WORKERS] Force exit")
            process.exit(1)
        }, 30_000)

        try {
            await Promise.all(workers.map(worker => worker.close()))
            await drainAndCloseQueues()
            await closeAllConnections()
            clearTimeout(forced)
            console.log("[WORKERS] Clean shutdown complete")
            process.exit(0)
        } catch (error) {
            console.error("[WORKERS] Shutdown error: ", error)
            clearTimeout(forced)
            process.exit(1)
        }
    }

    process.on("SIGTERM", () => stop("SIGTERM"))
    process.on("SIGINT", () => stop("SIGINT"))

    process.on("unhandledRejection", (reason) => {
        console.error("[WORKERS] Unhandled rejection: ", reason)
    })

    process.on("uncaughtException", (error) => {
        console.error("[WORKERS] Uncaught exception: ", error)
        stop("uncaughtException")
    })
}

start().catch((error) => {
    console.error("[WORKERS] Startup failed: ", error)
    process.exit(1)
})