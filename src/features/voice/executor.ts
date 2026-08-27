import type { VoiceCommand } from "#/types/voice.ts";

type Payload = Record<string, string | number | boolean | null>
type NavigateFn = (to: string) => void
type ActionHandler = (payload: Payload) => void | Promise<void>
type FormHandler = (fields: Payload) => void | Promise<void>

export interface ExecutorConfig {
    navigate: NavigateFn,
    actions: Record<string, ActionHandler>,
    forms: Record<string, FormHandler>
}

export interface ExecuteResult {
    success: boolean;
    message: string;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === "string") {
        return error;
    }

    try {
        return JSON.stringify(error);
    } catch {
        return "Unknown error";
    }
}

export function createExecutor(config: ExecutorConfig) {
    return async function executeCommand(command: VoiceCommand): Promise<ExecuteResult> {
        try {
            switch (command.type) {
                case "navigation": {
                    config.navigate(command.target)

                    return {
                        success: true,
                        message: `Navigated to ${command.target}`
                    }
                }
                case "form_fill": {
                    const handler = config.forms[command.target]

                    if (!handler) {
                        return {
                            success: false,
                            message: `No form handler for ${command.target}`
                        }
                    }

                    await handler(command.payload)

                    const filled = Object.entries(command.payload)
                        .map(([key, value]) => `${key}=${value}`)
                        .join(", ")

                    return {
                        success: true,
                        message: `Updated form "${command.target}": ${filled}`
                    }
                }

                case "action": {
                    const handler = config.actions[command.action]

                    if (!handler) {
                        return {
                            success: false,
                            message: `No handler for ${command.action}`
                        }
                    }

                    await handler(command.payload ?? {})

                    const withPayload = command.payload && Object.keys(command.payload).length > 0 ? `with ${JSON.stringify(command.payload)}` : ""

                    return {
                        success: true,
                        message: withPayload ? `Executed "${command.action}" ${withPayload}` : `Executed "${command.action}"`
                    }
                }

                case "unknown": {
                    return {
                        success: false,
                        message: "Command is not recognized"
                    }
                }
            }
        } catch (error) {
            return {
                success: false,
                message: `Execution failed: ${getErrorMessage(error)}`
            }
        }
    }
}

export async function executeAll(commands: Array<VoiceCommand>, executor: ReturnType<typeof createExecutor>, stopOnFailure = true): Promise<Array<ExecuteResult>> {
    const results: Array<ExecuteResult> = []

    for (const command of commands) {
        let result: ExecuteResult

        try {
            result = await executor(command)
        } catch (error) {
            result = {
                success: false,
                message: `Execution failed: ${getErrorMessage(error)}`
            }
        }

        results.push(result)

        if (!result.success && stopOnFailure) {
            break
        }
    }

    return results
}