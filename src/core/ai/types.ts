export interface ModelCapabilities {
    toolCalling: boolean
    structuredOutput: boolean
    vision: boolean
    maxContext: number
    maxOutputTokens: number
}

export interface ModelConfig {
    id: string
    name: string
    capabilities: ModelCapabilities
    costPer1kInputTokens?: number
    costPer1kOutputTokens?: number
}

export type ModelRole =
    | "planner"
    | "extractor"
    | "researcher"
    | "synthesizer"
    | "fallback"

// Model chains per role. All entries are verified to work on OpenRouter's free
// tier (supporting both structured JSON output and tool calling) as of the last
// update. Order matters: earlier models are preferred.
//
// Note: free model availability changes over time. If every model for a role
// starts returning 404/403, refresh this list from https://openrouter.ai/models
// (filter for free models) and re-verify with a small request.
// Ordering note: `nemotron-3-super` is listed first because it reliably returns
// parseable JSON. `nemotron-3-ultra` occasionally emits malformed JSON (e.g.
// duplicated `{"summary":"{...`) even with response_format=json_object, so it is
// kept as a secondary option. The router also validates JSON and falls through.
export const MODEL_ROLES: Record<ModelRole, string[]> = {
    planner: [
        "nvidia/nemotron-3-super-120b-a12b:free",
        "nvidia/nemotron-3-ultra-550b-a55b:free",
        "google/gemma-4-31b-it:free",
        "liquid/lfm-2.5-2.6b:free",
    ],
    extractor: [
        "nvidia/nemotron-3-super-120b-a12b:free",
        "nvidia/nemotron-3-ultra-550b-a55b:free",
        "google/gemma-4-31b-it:free",
        "liquid/lfm-2.5-2.6b:free",
    ],
    researcher: [
        "nvidia/nemotron-3-super-120b-a12b:free",
        "nvidia/nemotron-3-ultra-550b-a55b:free",
        "google/gemma-4-31b-it:free",
        "liquid/lfm-2.5-2.6b:free",
    ],
    synthesizer: [
        "nvidia/nemotron-3-super-120b-a12b:free",
        "nvidia/nemotron-3-ultra-550b-a55b:free",
        "liquid/lfm-2.5-2.6b:free",
    ],
    fallback: [
        "liquid/lfm-2.5-2.6b:free",
        "nvidia/nemotron-3.5-lightning:free",
    ],
}

/**
 * Allows a per-role model override via environment variables, e.g. when the free
 * daily quota is exhausted or a specific paid model is preferred:
 *
 *   OPENROUTER_MODEL_PLANNER=openai/gpt-4o-mini
 *   OPENROUTER_MODEL_EXTRACTOR=...
 *   OPENROUTER_MODEL_RESEARCHER=...
 *   OPENROUTER_MODEL_SYNTHESIZER=...
 *   OPENROUTER_MODEL_FALLBACK=...
 *
 * The override is inserted at the front of the role's chain (tried first).
 */
function readRoleOverride(role: ModelRole): string | undefined {
    try {
        if (typeof process === "undefined" || !process.env) return undefined
        const value = process.env[`OPENROUTER_MODEL_${role.toUpperCase()}`]
        return value && value.trim() ? value.trim() : undefined
    } catch {
        return undefined
    }
}

for (const role of Object.keys(MODEL_ROLES) as ModelRole[]) {
    const override = readRoleOverride(role)
    if (override && !MODEL_ROLES[role].includes(override)) {
        MODEL_ROLES[role].unshift(override)
    }
}

export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
    "nvidia/nemotron-3-ultra-550b-a55b:free": {
        toolCalling: true,
        structuredOutput: true,
        vision: false,
        maxContext: 256000,
        maxOutputTokens: 8192,
    },
    "nvidia/nemotron-3-super-120b-a12b:free": {
        toolCalling: true,
        structuredOutput: true,
        vision: false,
        maxContext: 128000,
        maxOutputTokens: 8192,
    },
    "nvidia/nemotron-3.5-lightning:free": {
        toolCalling: true,
        structuredOutput: true,
        vision: false,
        maxContext: 128000,
        maxOutputTokens: 8192,
    },
    "liquid/lfm-2.5-2.6b:free": {
        toolCalling: true,
        structuredOutput: true,
        vision: false,
        maxContext: 32000,
        maxOutputTokens: 8192,
    },
    "google/gemma-4-31b-it:free": {
        toolCalling: true,
        structuredOutput: true,
        vision: false,
        maxContext: 128000,
        maxOutputTokens: 8192,
    },
}

export function getModelCapabilities(modelId: string): ModelCapabilities {
    return MODEL_CAPABILITIES[modelId] ?? {
        toolCalling: false,
        structuredOutput: false,
        vision: false,
        maxContext: 32000,
        maxOutputTokens: 4096,
    }
}

export function getModelForRole(role: ModelRole, preferredModel?: string): string {
    if (preferredModel) return preferredModel
    const models = MODEL_ROLES[role]
    return models[0]
}

export function getFallbackModels(exclude: string[] = []): string[] {
    const allModels = [
        ...MODEL_ROLES.planner,
        ...MODEL_ROLES.extractor,
        ...MODEL_ROLES.researcher,
        ...MODEL_ROLES.synthesizer,
        ...MODEL_ROLES.fallback,
    ]
    const unique = [...new Set(allModels)]
    return unique.filter(m => !exclude.includes(m))
}