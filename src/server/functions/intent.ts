import { createServerFn } from "@tanstack/react-start";
import type { ActionCommand, FormFillCommand, NavigationCommand, UnknownCommand, VoiceCommand, VoiceCommandContext, VoiceSchema } from "#/types/voice.ts";
import { z } from "zod";
import axios from "axios";
import type {AxiosError} from "axios";

const zodVoiceSchema = z.union([
    z.custom<z.ZodTypeAny>(),
    z.record(z.string(), z.unknown())
]);

const ParseIntentInput = z.object({
    transcript: z.string(),
    context: z.object({
        routes: z.array(z.object({
            path: z.string(),
            name: z.string()
        })).optional(),
        forms: z.record(z.string(), zodVoiceSchema).optional(),
        actions: z.record(z.string(), zodVoiceSchema).optional(),
        language: z.string().optional()
    })
});

export interface ParseIntentResult {
    commands: Array<VoiceCommand>;
}

export interface AIResponse {
    choices: Array<{
        message: {
            content: string;
        }
    }>;
}

interface JsonSchemaField {
    type?: string | string[];
    description?: string;
    enum?: unknown[];
    anyOf?: JsonSchemaField[];
    oneOf?: JsonSchemaField[];
    items?: JsonSchemaField;
    $ref?: string;
}

interface JsonSchemaObject {
    description?: string;
    type?: string;
    properties?: Record<string, JsonSchemaField>;
    required?: string[];
}

interface ValidatePayloadResult {
    data: Record<string, string | number | boolean | null>;
    warning?: string;
}

function toJsonSchema(schema: VoiceSchema): JsonSchemaObject | null {
    if (!(schema instanceof z.ZodType)) {
        return {
            type: "object",
            properties: Object.fromEntries(
                Object.keys(schema).map((key) => [key, { type: "string" }])
            ),
        };
    }

    try {
        return z.toJSONSchema(schema) as JsonSchemaObject;
    } catch {
        return null;
    }
}

function typeLabel(field: JsonSchemaField): string {
    if (field.enum) {
        const values = field.enum
            .filter((value) => value !== null)
            .map((value) => JSON.stringify(value))
            .join(" | ");

        return `enum(${values})`;
    }

    const union = field.anyOf ?? field.oneOf;

    if (union) {
        const nonNull = union.filter(
            (schema) => schema.type !== "null" && !(schema.enum?.length === 1 && schema.enum[0] === null)
        );

        if (nonNull.length === 1) return typeLabel(nonNull[0]);

        if (nonNull.length === 0) return "null";

        return nonNull.map(typeLabel).join(" | ");
    }

    if (field.type === "array" && field.items) {
        return `${typeLabel(field.items)}[]`;
    }

    if (Array.isArray(field.type)) {
        const nonNull = field.type.filter((type) => type !== "null");

        return nonNull.join(" | ") || "any";
    }

    if (field.$ref) return "object";

    return field.type ?? "any";
}

function schemaToPromptBlock(label: string, schema: VoiceSchema): string {
    const json = toJsonSchema(schema);

    if (!json) {
        return ` "${label}": (schema unavailable) `;
    }

    const topDescription = json.description ? `<- ${json.description}` : "";
    const lines = [` "${label}" ${topDescription}`];
    const properties = json.properties;
    const required = json.required ?? [];

    if (!properties || Object.keys(properties).length === 0) {
        lines.push(" (no params - zero-argument action)");

        return lines.join("\n");
    }

    lines.push(" params:");

    for (const [key, field] of Object.entries(properties)) {
        const isRequired = required.includes(key);
        const type = typeLabel(field);
        const fieldDescription = field.description ? `<- ${field.description}` : "";
        lines.push(` - "${key}": ${type} ${isRequired ? "[REQUIRED]" : "(optional)"} ${fieldDescription}`);
    }

    return lines.join("\n");
}

function buildSystemPrompt(context: VoiceCommandContext): string {
    const routeBlock = context.routes && context.routes.length > 0
        ? context.routes.map(route => ` "${route.path}" <- ${route.name}`).join("\n")
        : " (none)";

    const formBlock = context.forms && Object.keys(context.forms).length > 0
        ? Object.entries(context.forms).map(([id, schema]) => schemaToPromptBlock(id, schema)).join("\n\n")
        : " (none)";

    const actionBlock = context.actions && Object.keys(context.actions).length > 0
        ? Object.entries(context.actions).map(([id, schema]) => schemaToPromptBlock(id, schema)).join("\n\n")
        : " (none)";

    return `
You are a voice command parser for a web application.
Map each transaction to one or more structured JSON command objects.

### STRICT RULES
1. Output only a raw JSON array. No markdown, no code fences, no commentary. Always wrap output in [ ], even for a single command.
2. "target" (routes/forms) and "action" names must be copied exactly (VERBATIM) from the allowedlists below. Never invent, abbreviate, or translate identifiers.
3. Payload keys must match the param names in schema exactly (VERBATIM).
4. Payload values must watch the declared type:
    - string: text enclose with ""
    - number: plain JSON number, never a string (200 not "200")
    - boolean: true / false
    - enum: one of the listed values exactly
5. If a REQUIRED param is not present in the transcript, use type "unknown" for that command. Do NOT guess or fabricate required values.
6. If confidence < 0.60, use type "unknown".
7. Compound utterances ("go to X and do Y"): produce multiple objects in the array. Most utterances -> single object array

### COMMAND SCHEMA (one per array element)
- Navigation: 
    { "type": "navigation", "target": "<exact path>", "confidence": <0-1> }

- Form fill:
    { "type": "form_fill", "target": "<form_id>", "payload": { "<key>": <value> }, "confidence": <0-1> }

- Action (zero params):
    { "type": "action", "action": "<name>", "confidence": <0-1> }

- Action (with params):
    { "type": "action", "action": "<name>", "payload": { "<key>": <value> }, "confidence": <0-1> }

- Unknown / low confidence:
    { "type": "unknown", "confidence": <0-1>, "rawTranscript": "<echo the input>" }

### ALLOWEDLISTS
- ROUTES (for navigation)
${routeBlock}

- FORMS (for form_fill)
${formBlock}

- ACTIONS (for action)
${actionBlock}

### LANGUAGE NOTES
- Transcript may be Nepali (Devanagari), English, or mixed.
- Identifiers in output (keys, action names, paths) are always Latin-Script verbatim copies from the allowedlists.
- String payload values (eg. product name) may be in Nepali if appropriate.
- Numbers are always plain JSON numbers regardless of source language.
    `.trim();
}

function jsonSchemaToZod(schemaObj: JsonSchemaObject): z.ZodTypeAny {
    if (!schemaObj.properties) {
        return z.object({});
    }

    const shape: Record<string, z.ZodTypeAny> = {};
    const required = new Set(schemaObj.required ?? []);

    for (const [key, field] of Object.entries(schemaObj.properties)) {
        let zodType: z.ZodTypeAny;

        if (field.enum) {
            zodType = z.enum(field.enum as [string, ...string[]]);
        } else if (field.type === "string") {
            zodType = z.string();
        } else if (field.type === "number" || field.type === "integer") {
            zodType = z.number();
        } else if (field.type === "boolean") {
            zodType = z.boolean();
        } else if (field.type === "array" && field.items) {
            const itemSchema = jsonSchemaToZod({ type: "object", properties: { item: field.items } });
            zodType = z.array(itemSchema);
        } else {
            zodType = z.any();
        }
        shape[key] = required.has(key) ? zodType : zodType.optional();
    }

    return z.object(shape);
}


function ensureZodSchema(schema: VoiceSchema): z.ZodTypeAny {
    if (schema instanceof z.ZodType) {
        return schema;
    }

    const jsonSchema = toJsonSchema(schema);

    if (!jsonSchema) {
        return z.object({});
    }

    return jsonSchemaToZod(jsonSchema);
}

function getMissingRequiredFields(payload: Record<string, unknown>, schema: VoiceSchema): Array<string> {
    const zodSchema = ensureZodSchema(schema);
    const shape = zodSchema._def.shape?.();

    if (!shape) return [];

    const required: string[] = [];

    for (const [key, type] of Object.entries(shape)) {
        if (!type.isOptional?.()) {
            required.push(key);
        }
    }

    return required.filter(key => payload[key] == null);
}

function preCoerceNumbers(
    payload: Record<string, unknown>,
    schema: VoiceSchema
): Record<string, unknown> {
    const json = toJsonSchema(schema);

    if (!json?.properties) return payload;

    const coerced = { ...payload };

    for (const [key, field] of Object.entries(json.properties)) {
        const type = typeLabel(field);

        if ((type === "number" || type === "integer") && typeof coerced[key] === "string") {
            const number = Number(coerced[key]);
            if (!Number.isNaN(number)) coerced[key] = number;
        }
    }

    return coerced;
}

function validatePayload(rawPayload: Record<string, unknown>, schema: VoiceSchema): ValidatePayloadResult {
    const coerced = preCoerceNumbers(rawPayload, schema);
    const zodSchema = ensureZodSchema(schema);
    const result = zodSchema.safeParse(coerced);

    if (!result.success) {
        const warning = result.error.issues.map((issue) => `${issue.path.join(".")}:${issue.message}`).join("; ");

        return {
            data: coerced as Record<string, string | number | boolean | null>,
            warning
        };
    }

    return {
        data: result.data as Record<string, string | number | boolean | null>
    };
}

function unknownFallback(reason: string): UnknownCommand {
    console.warn("[INTENT] ", reason);

    return {
        type: "unknown",
        confidence: 0,
        rawTranscript: reason
    };
}

function validateSingleCommand(raw: unknown, context: VoiceCommandContext): VoiceCommand {
    if (typeof raw !== "object" || raw === null) {
        return unknownFallback("No Object in command array");
    }

    const object = raw as Record<string, unknown>;
    const confidence = (object.confidence as number) ?? 0;

    switch (object.type) {
        case "navigation": {
            const allowedPaths = (context.routes ?? []).map(route => route.path);

            if (!allowedPaths.includes(object.target as string)) {
                return unknownFallback(`Route "${object.target}" is not in allowedlist`);
            }

            return {
                type: "navigation",
                target: object.target as string,
                confidence,
            } satisfies NavigationCommand;
        }
        case "form_fill": {
            const formSchema = context.forms?.[object.target as string];

            if (!formSchema) {
                return unknownFallback(`Form "${object.target}" is not registered`);
            }

            const rawPayload = (object.payload ?? {}) as Record<string, unknown>;
            const missing = getMissingRequiredFields(rawPayload, formSchema);

            if (missing.length > 0) {
                return unknownFallback(`Required form fields not found in speech: "${missing.join(", ")}"`);
            }

            const { data, warning } = validatePayload(rawPayload, formSchema);

            if (warning) {
                console.warn("[INTENT] form_fill warning: ", warning);
            }

            return {
                type: "form_fill",
                target: object.target as string,
                payload: data,
                confidence
            } satisfies FormFillCommand;
        }
        case "action": {
            const actionSchema = context.actions?.[object.action as string];

            if (!actionSchema) {
                return unknownFallback(`Action "${object.action}" is not registered`);
            }

            const rawPayload = (object.payload ?? {}) as Record<string, unknown>;
            const missing = getMissingRequiredFields(rawPayload, actionSchema);

            if (missing.length > 0) {
                return unknownFallback(`Required params for action "${object.action}" not found in speech: ${missing.join(", ")}. Ask user to be more specific`);
            }

            const { data, warning } = validatePayload(rawPayload, actionSchema);

            if (warning) {
                console.warn("[INTENT] action warning: ", warning);
            }

            const command: ActionCommand = {
                type: "action",
                action: object.action as string,
                confidence,
            };

            if (Object.keys(data).length > 0) {
                command.payload = data;
            }

            return command;
        }
        case "unknown": {
            return {
                type: "unknown",
                confidence,
                rawTranscript: (object.rawTranscript as string) ?? ""
            } satisfies UnknownCommand;
        }
        default:
            return unknownFallback(`Unknown Command type: ${object.type}`);
    }
}

export const parseIntent = createServerFn({ method: "POST" })
    .inputValidator(ParseIntentInput)
    .handler(async ({ data }): Promise<ParseIntentResult> => {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            throw { message: "[INTENT] OPENROUTER_API_KEY is not configured" };
        }

        const systemPrompt = buildSystemPrompt(data.context);

        try {
            const response = await axios.post<AIResponse>(
                "https://openrouter.ai/api/v1/chat/completions",
                {
                    model: "poolside/laguna-m.1:free",
                    temperature: 0,
                    max_tokens: 1024,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: `Transcript: "${data.transcript}"` }
                    ]
                },
                {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        "Content-Type": "application/json"
                    },
                    timeout: 15_000
                }
            );

            const raw = response.data.choices?.[0]?.message?.content ?? "";
            const cleaned = raw.trim().replace(/^```json|^```|```$/g, "").trim();

            let parsed: unknown;
            
            try {
                parsed = JSON.parse(cleaned);
            } catch (error) {
                console.error("[INTENT] JSON parsing failed");
                parsed = null;
            }

            const rawArray: Array<unknown> = Array.isArray(parsed) ? parsed : [parsed];
            const commands = rawArray.map(item => validateSingleCommand(item, data.context));

            return { commands };
        } catch (error) {
            const axiosError = error as AxiosError<{ detail?: unknown }>;
            const detail = axiosError.response?.data.detail;
            const message = (typeof detail === "string" ? detail : JSON.stringify(detail)) ?? axiosError.message ?? "Unknown OpenRouter Error";

            throw { message: `[INTENT] Openrouter request failed: ${message}` };
        }
    });