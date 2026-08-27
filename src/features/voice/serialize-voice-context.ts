import { z } from "zod";
import type { VoiceCommandContext } from "#/types/voice.ts";

export function serializeVoiceContext(context: VoiceCommandContext): VoiceCommandContext {
    const serialized = { ...context };

    if (context.forms) {
        serialized.forms = Object.fromEntries(
            Object.entries(context.forms).map(([id, schema]) => {
                if (schema instanceof z.ZodType) {
                    return [id, z.toJSONSchema(schema)];
                }

                return [id, schema];
            })
        );
    }

    if (context.actions) {
        serialized.actions = Object.fromEntries(
            Object.entries(context.actions).map(([id, schema]) => {
                if (schema instanceof z.ZodType) {
                    return [id, z.toJSONSchema(schema)];
                }
                return [id, schema];
            })
        );
    }

    return serialized;
}