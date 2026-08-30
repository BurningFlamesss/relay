import type { ScrapingSourceType, SourceAdapter } from "#/core/types.ts";
import { readdirSync } from "node:fs";
import { extname, basename, resolve } from "node:path"

const registry = new Map<ScrapingSourceType, SourceAdapter>()

const sourceDir = __dirname

for (const file of readdirSync(sourceDir)) {
    const extension = extname(file)
    const name = basename(file, extension)

    if (name === "index") {
        continue
    }

    if (extension !== ".ts" && extension !== ".js") {
        continue
    }

    const mod = require(resolve(sourceDir, file))
    const adapter = (mod.default ?? mod) as Partial<SourceAdapter>

    if (typeof adapter.scrape !== "function") {
        throw new Error()
    }

    if (!adapter.source) {
        throw new Error()
    }

    if (typeof adapter.rateLimit !== "number" || adapter.rateLimit <= 0) {
        throw new Error()
    }

    if (registry.has(adapter.source)) {
        throw new Error()
    }

    registry.set(adapter.source, adapter as SourceAdapter)
    console.log(`[SOURCE_REGISTRY] Registered: ${adapter.source} (${file})`)
}

export function getAdapter(source: ScrapingSourceType): SourceAdapter {
    const adapter = registry.get(source)

    if (!adapter) {
        const kebab = source.toLowerCase().replace(/_/g, "-")

        throw new Error(`
            [SOURCE_REGISTRY] No adapter registered for "${source}". 
            Create scraper/sources/${kebab}.ts with a default SourceAdapter export.
            `)
    }

    return adapter
}

export function getRegisteredSource(): Array<ScrapingSourceType> {
    return [...registry.keys()]
}

export function isRegistered(source: ScrapingSourceType): boolean {
    return registry.has(source)
}