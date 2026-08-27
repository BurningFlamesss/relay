import type { z } from "zod";

export type VoiceCommandType = "navigation" | "form_fill" | "action" | "unknown"

export interface NavigationCommand {
    type: "navigation";
    target: string;
    confidence: number;
}

export interface FormFillCommand {
    type: "form_fill";
    target: string;
    payload: Record<string, string | number | boolean | null>;
    confidence: number;
}

export interface ActionCommand {
    type: "action";
    action: string;
    payload?: Record<string, string | number | boolean | null>;
    confidence: number;
}

export interface UnknownCommand {
    type: "unknown";
    confidence: number;
    rawTranscript: string;
}

export type VoiceCommand = NavigationCommand | FormFillCommand | ActionCommand | UnknownCommand


export interface VoiceCommandContext {
    routes?: Array<Route>;
    forms?: Record<string, VoiceSchema>;
    actions?: Record<string, VoiceSchema>;
    language?: string;
}

export type Route = {
    path: string;
    name: string;
}

export type VoiceSchema =
    | z.ZodTypeAny
    | Record<string, unknown>


export type VoiceState = "idle" | "recording" | "transcribing" | "parsing" | "ready" | "error"

export interface VoiceCommandResult {
    command: Array<VoiceCommand>;
    transcript: string;
    durationMs: number;
}

// Example:

// const voiceContext: VoiceCommandContext = {
//     actions: {
//         "add_user": z.string()
//     },
//     forms: {
//         product_form: z.object({
//             name: z.string()
//         })
//     }
// }