import { config } from "dotenv";
import { expand } from "dotenv-expand";

expand(config({ path: ".env.local" }))

await import("../src/core/workers/research/index.ts")

console.log("[workers] Research Worker started")