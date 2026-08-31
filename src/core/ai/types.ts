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

export const MODEL_ROLES: Record<ModelRole, string[]> = {
    planner: [
        "minimax/minimax-m3:free",
        "thinkingmachines/inkling:free",
    ],
    extractor: [
        "liquid/lfm-2.5-2.6b:free",
        "google/gemma-4-31b-it:free",
    ],
    researcher: [
        "thinkingmachines/inkling:free",
        "google/gemma-4-31b-it:free",
        "minimax/minimax-m3:free",
    ],
    synthesizer: [
        "minimax/minimax-m3:free",
        "google/gemma-4-31b-it:free",
    ],
    fallback: [
        "inclusionai/ling-3.0-flash-fin:free",
        "liquid/lfm-2.5-2.6b:free",
    ],
}

export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
    "inclusionai/ling-3.0-flash-fin:free": {
        toolCalling: false,
        structuredOutput: false,
        vision: false,
        maxContext: 128000,
        maxOutputTokens: 4096,
    },
    "liquid/lfm-2.5-2.6b:free": {
        toolCalling: true,
        structuredOutput: true,
        vision: false,
        maxContext: 32000,
        maxOutputTokens: 8192,
    },
    "thinkingmachines/inkling:free": {
        toolCalling: false,
        structuredOutput: false,
        vision: false,
        maxContext: 32000,
        maxOutputTokens: 8192,
    },
    "minimax/minimax-m3:free": {
        toolCalling: true,
        structuredOutput: true,
        vision: false,
        maxContext: 128000,
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