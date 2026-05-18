import { config } from "dotenv";
import { expand } from "dotenv-expand";

expand(config({ path: ".env.local" }))

await import("../src/core/workers/analyze/analyze.worker")

console.log("[workers] Analyze Worker started")