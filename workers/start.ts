import { config } from "dotenv";
import { expand } from "dotenv-expand";

expand(config({ path: ".env.local" }))

await import("../src/lib/queue/workers/analyze.worker")

console.log("[workers] Analyze Worker started")