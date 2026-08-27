import axios from "axios";
import FormData from "form-data";

export interface TranscriptionOptions {
    buffer: Buffer;
    filename: string;
    mimeType: string;
    languageCode?: string;
}

export async function transcribeWithElevenLabs({ buffer, filename, mimeType, languageCode = "ne" }: TranscriptionOptions) {
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
        console.error("ELEVENLABS_API_KEY is not configured");
    }

    const form = new FormData();

    form.append("file", buffer, { filename, contentType: mimeType });
    form.append("model_id", "scribe_v1");
    form.append("language_code", languageCode);

    const response = await axios.post<{ text: string }>("https://api.elevenlabs.io/v1/speech-to-text",
        form,
        {
            headers: {
                "xi-api-key": apiKey,
                ...form.getHeaders(),
            },
            timeout: 30_000,
            maxBodyLength: Infinity,
        }
    );

    return response.data.text ?? "";
}
