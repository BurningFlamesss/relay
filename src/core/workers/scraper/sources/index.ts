import type { SourceAdapter } from "#/core/types.ts";
import type { ScrapingSourceType } from "#/generated/prisma/browser.ts";

const registry = new Map<ScrapingSourceType, SourceAdapter>()

const sourceDir = __dirname



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