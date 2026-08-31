import { serverEnv } from "#/env/server.ts"
import type {
    ModelCapabilities,
    ModelRole,
    MODEL_ROLES,
    getModelCapabilities,
    getModelForRole,
    getFallbackModels,
} from "./types.ts"

export interface AIMessage {
    role: "system" | "user" | "assistant" | "tool"
    content: string
    toolCalls?: AIToolCall[]
    toolCallId?: string
    name?: string
}

export interface AIToolCall {
    id: string
    type: "function"
    function: {
        name: string
        arguments: string
    }
}

export interface AITool {
    type: "function"
    function: {
        name: string
        description: string
        parameters: Record<string, unknown>
    }
}

export interface AIRequest {
    messages: AIMessage[]
    model?: string
    role?: ModelRole
    temperature?: number
    maxTokens?: number
    tools?: AITool[]
    toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } }
    responseFormat?: { type: "json_object" } | { type: "text" }
    stream?: boolean
    metadata?: Record<string, unknown>
}

export interface AIResponse {
    content: string
    model: string
    usage?: {
        promptTokens: number
        completionTokens: number
        totalTokens: number
    }
    toolCalls?: AIToolCall[]
    finishReason: string
    cached: boolean
}

export interface AIStreamChunk {
    content: string
    toolCalls?: AIToolCall[]
    finishReason?: string
}

export interface AIProvider {
    complete: (request: AIRequest) => Promise<AIResponse>
    stream: (request: AIRequest) => AsyncIterable<AIStreamChunk>
    getModelCapabilities: (model: string) => ModelCapabilities
    selectModel: (role: ModelRole, preferredModel?: string) => string
    getFallbackModels: (exclude: string[]) => string[]
}

export class AIProviderError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly statusCode?: number,
        public readonly retryable: boolean = false,
        public readonly model?: string
    ) {
        super(message)
        this.name = "AIProviderError"
    }
}

export function createAIProvider(): AIProvider {
    return new OpenRouterProvider()
}

class OpenRouterProvider implements AIProvider {
    private readonly baseUrl: string
    private readonly apiKey: string
    private readonly defaultTimeout: number
    private readonly requestLog: Array<{
        timestamp: number
        model: string
        tokens: number
        latency: number
        success: boolean
        error?: string
    }> = []

    constructor() {
        this.baseUrl = serverEnv.OPENROUTER_BASE_URL
        this.apiKey = serverEnv.OPENROUTER_API_KEY ?? ""
        this.defaultTimeout = serverEnv.RESEARCH_AI_TIMEOUT_MS

        if (!this.apiKey) {
            console.warn("[AI] OPENROUTER_API_KEY not configured - AI calls will fail")
        }
    }

    getModelCapabilities(model: string): ModelCapabilities {
        return getModelCapabilities(model)
    }

    selectModel(role: ModelRole, preferredModel?: string): string {
        return getModelForRole(role, preferredModel)
    }

    getFallbackModels(exclude: string[] = []): string[] {
        return getFallbackModels(exclude)
    }

    async complete(request: AIRequest): Promise<AIResponse> {
        const model = request.model ?? this.selectModel(request.role ?? "researcher")
        const capabilities = this.getModelCapabilities(model)
        const startTime = Date.now()

        const payload = this.buildPayload(request, model, capabilities)
        const response = await this.fetchWithRetry(payload, model)
        const data = await response.json()

        const latency = Date.now() - startTime
        const usage = data.usage
        const choice = data.choices?.[0]

        if (!choice) {
            throw new AIProviderError(
                "No response from model",
                "NO_RESPONSE",
                response.status,
                true,
                model
            )
        }

        const result: AIResponse = {
            content: choice.message?.content ?? "",
            model: data.model ?? model,
            usage: usage ? {
                promptTokens: usage.prompt_tokens,
                completionTokens: usage.completion_tokens,
                totalTokens: usage.total_tokens,
            } : undefined,
            toolCalls: choice.message?.tool_calls,
            finishReason: choice.finish_reason ?? "stop",
            cached: false,
        }

        this.logRequest(model, usage?.total_tokens ?? 0, latency, true)
        return result
    }

    async *stream(request: AIRequest): AsyncIterable<AIStreamChunk> {
        const model = request.model ?? this.selectModel(request.role ?? "researcher")
        const capabilities = this.getModelCapabilities(model)
        const startTime = Date.now()

        const payload = this.buildPayload(request, model, capabilities)
        payload.stream = true

        const response = await this.fetchWithRetry(payload, model)

        if (!response.body) {
            throw new AIProviderError(
                "No response stream",
                "NO_STREAM",
                response.status,
                true,
                model
            )
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let totalTokens = 0

        try {
            for (;;) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value, { stream: true })
                const lines = chunk.split("\n")

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue
                    const data = line.slice(6).trim()
                    if (data === "[DONE]") continue

                    try {
                        const parsed = JSON.parse(data)
                        const delta = parsed.choices?.[0]?.delta
                        const finishReason = parsed.choices?.[0]?.finish_reason

                        if (delta?.content) {
                            yield { content: delta.content }
                        }
                        if (delta?.tool_calls) {
                            yield { content: "", toolCalls: delta.tool_calls }
                        }
                        if (finishReason) {
                            yield { content: "", finishReason }
                        }
                        if (parsed.usage) {
                            totalTokens = parsed.usage.total_tokens
                        }
                    } catch {
                    }
                }
            }
        } finally {
            reader.releaseLock()
            const latency = Date.now() - startTime
            this.logRequest(model, totalTokens, latency, true)
        }
    }

    private buildPayload(request: AIRequest, model: string, capabilities: ModelCapabilities): Record<string, unknown> {
        const payload: Record<string, unknown> = {
            model,
            messages: request.messages.map(m => ({
                role: m.role,
                content: m.content,
                ...(m.toolCalls && { tool_calls: m.toolCalls }),
                ...(m.toolCallId && { tool_call_id: m.toolCallId }),
                ...(m.name && { name: m.name }),
            })),
            temperature: request.temperature ?? 0.3,
            max_tokens: request.maxTokens ?? Math.min(capabilities.maxOutputTokens, 8192),
        }

        if (request.tools && request.tools.length > 0 && capabilities.toolCalling) {
            payload.tools = request.tools
            payload.tool_choice = request.toolChoice ?? "auto"
        }

        if (request.responseFormat) {
            if (request.responseFormat.type === "json_object" && capabilities.structuredOutput) {
                payload.response_format = { type: "json_object" }
            }
        }

        if (request.metadata) {
            payload.metadata = request.metadata
        }

        return payload
    }

    private async fetchWithRetry(payload: Record<string, unknown>, model: string, attempt = 1): Promise<Response> {
        const maxAttempts = 3
        const baseDelay = 1000

        for (let i = attempt; i <= maxAttempts; i++) {
            try {
                const controller = new AbortController()
                const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeout)

                const response = await fetch(`${this.baseUrl}/chat/completions`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${this.apiKey}`,
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://relay.local",
                        "X-Title": "Relay Research Analyst",
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                })

                clearTimeout(timeoutId)

                if (response.status === 429) {
                    const retryAfter = response.headers.get("Retry-After")
                    const delay = retryAfter ? parseInt(retryAfter) * 1000 : baseDelay * Math.pow(2, i - 1)
                    console.warn(`[AI] Rate limited, waiting ${delay}ms before retry ${i}/${maxAttempts}`)
                    await this.sleep(delay)
                    continue
                }

                if (response.status >= 500) {
                    if (i < maxAttempts) {
                        const delay = baseDelay * Math.pow(2, i - 1)
                        console.warn(`[AI] Server error ${response.status}, retry ${i}/${maxAttempts} in ${delay}ms`)
                        await this.sleep(delay)
                        continue
                    }
                }

                if (!response.ok) {
                    const errorText = await response.text()
                    throw new AIProviderError(
                        `OpenRouter error: ${response.status} - ${errorText}`,
                        "API_ERROR",
                        response.status,
                        response.status >= 500 || response.status === 429,
                        model
                    )
                }

                return response
            } catch (error) {
                if (error instanceof AIProviderError) throw error

                if (error instanceof DOMException && error.name === "AbortError") {
                    throw new AIProviderError(
                        "Request timeout",
                        "TIMEOUT",
                        408,
                        true,
                        model
                    )
                }

                if (i < maxAttempts) {
                    const delay = baseDelay * Math.pow(2, i - 1)
                    console.warn(`[AI] Network error, retry ${i}/${maxAttempts} in ${delay}ms: ${error}`)
                    await this.sleep(delay)
                    continue
                }

                throw new AIProviderError(
                    `Network error: ${error}`,
                    "NETWORK_ERROR",
                    undefined,
                    true,
                    model
                )
            }
        }

        throw new AIProviderError(
            "Max retries exceeded",
            "MAX_RETRIES",
            undefined,
            false,
            model
        )
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    private logRequest(model: string, tokens: number, latency: number, success: boolean, error?: string): void {
        this.requestLog.push({
            timestamp: Date.now(),
            model,
            tokens,
            latency,
            success,
            error,
        })

        if (this.requestLog.length > 1000) {
            this.requestLog.shift()
        }

        console.log(`[AI] ${model} - ${tokens} tokens - ${latency}ms - ${success ? "ok" : "failed"}${error ? ` - ${error}` : ""}`)
    }

    getRequestLog() {
        return [...this.requestLog]
    }
}