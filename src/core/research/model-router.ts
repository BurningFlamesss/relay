import { createAIProvider     } from "#/core/ai/provider.ts"
import type {AIProvider, AIRequest, AIResponse, ModelRole} from "#/core/ai/provider.ts";
import type { ModelCapabilities } from "#/core/ai/types.ts"

export interface ModelRouterConfig {
    maxRetries: number
    retryDelayMs: number
    fallbackEnabled: boolean
}

export class ModelRouter {
    private provider: AIProvider
    private config: ModelRouterConfig
    private invocationLog: Array<{
        timestamp: number
        model: string
        role: ModelRole
        task: string
        success: boolean
        latency: number
        error?: string
    }> = []

    constructor(config: Partial<ModelRouterConfig> = {}) {
        this.provider = createAIProvider()
        this.config = {
            maxRetries: config.maxRetries ?? 3,
            retryDelayMs: config.retryDelayMs ?? 1000,
            fallbackEnabled: config.fallbackEnabled ?? true,
        }
    }

    async complete(request: AIRequest, role: ModelRole): Promise<AIResponse> {
        const models = this.getModelChain(role, request.model)
        let lastError: Error | null = null

        for (const model of models) {
            const capabilities = this.provider.getModelCapabilities(model)
            const modelRequest = { ...request, model, role }

            if (request.responseFormat?.type === "json_object" && !capabilities.structuredOutput) {
                console.warn(`[ROUTER] Model ${model} does not support structured output, skipping`)
                continue
            }

            if (request.tools && request.tools.length > 0 && !capabilities.toolCalling) {
                console.warn(`[ROUTER] Model ${model} does not support tool calling, skipping`)
                continue
            }

            try {
                const startTime = Date.now()
                const response = await this.provider.complete(modelRequest)
                const latency = Date.now() - startTime

                this.logInvocation(model, role, request.task ?? "complete", true, latency)
                return response
            } catch (error) {
                lastError = error as Error
                const latency = Date.now() - (Date.now() - 1000)

                this.logInvocation(model, role, request.task ?? "complete", false, latency, error instanceof Error ? error.message : "Unknown error")

                if (error instanceof Error && "retryable" in error && (error as { retryable: boolean }).retryable === false) {
                    break
                }

                console.warn(`[ROUTER] Model ${model} failed: ${error}. Trying next...`)
                await this.sleep(this.config.retryDelayMs)
            }
        }

        throw new Error(`All models failed for role ${role}. Last error: ${lastError?.message}`)
    }

    async *stream(request: AIRequest, role: ModelRole): AsyncIterable<{ content: string }> {
        const models = this.getModelChain(role, request.model)
        let lastError: Error | null = null

        for (const model of models) {
            const capabilities = this.provider.getModelCapabilities(model)
            const modelRequest = { ...request, model, role, stream: true }

            if (request.tools && request.tools.length > 0 && !capabilities.toolCalling) {
                console.warn(`[ROUTER] Model ${model} does not support tool calling, skipping`)
                continue
            }

            try {
                const startTime = Date.now()
                let hasOutput = false

                for await (const chunk of this.provider.stream(modelRequest)) {
                    hasOutput = true
                    yield chunk
                }

                const latency = Date.now() - startTime
                this.logInvocation(model, role, request.task ?? "stream", true, latency)
                return
            } catch (error) {
                lastError = error as Error
                const latency = Date.now() - (Date.now() - 1000)

                this.logInvocation(model, role, request.task ?? "stream", false, latency, error instanceof Error ? error.message : "Unknown error")

                console.warn(`[ROUTER] Model ${model} stream failed: ${error}. Trying next...`)
                await this.sleep(this.config.retryDelayMs)
            }
        }

        throw new Error(`All models failed for role ${role}. Last error: ${lastError?.message}`)
    }

    private getModelChain(role: ModelRole, preferredModel?: string): string[] {
        const chain: string[] = []

        if (preferredModel) {
            chain.push(preferredModel)
        }

        const primary = this.provider.selectModel(role)
        if (primary && !chain.includes(primary)) {
            chain.push(primary)
        }

        if (this.config.fallbackEnabled) {
            const fallbacks = this.provider.getFallbackModels(chain)
            chain.push(...fallbacks)
        }

        return [...new Set(chain)]
    }

    private logInvocation(
        model: string,
        role: ModelRole,
        task: string,
        success: boolean,
        latency: number,
        error?: string
    ): void {
        this.invocationLog.push({
            timestamp: Date.now(),
            model,
            role,
            task,
            success,
            latency,
            error,
        })

        if (this.invocationLog.length > 500) {
            this.invocationLog.shift()
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    getInvocationLog() {
        return [...this.invocationLog]
    }

    getProvider(): AIProvider {
        return this.provider
    }
}

export function createModelRouter(config?: Partial<ModelRouterConfig>): ModelRouter {
    return new ModelRouter(config)
}

export function getModelCapabilities(model: string): ModelCapabilities {
    const provider = createAIProvider()
    return provider.getModelCapabilities(model)
}