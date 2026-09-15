import { config } from "dotenv";
import { expand } from "dotenv-expand";

expand(config({ path: ".env.local" }))

const { start } = await import("../src/core/workers/index.ts")

start().catch((error) => {
    console.error("[WORKERS] Startup failed:", error)
    process.exit(1)
})