interface TranscriptionResponse {
    transcript: string;
}

interface TranscriptionErrorResponse {
    error?: string;
    message?: string;
}

function getErrorMessage(body: string, status: number): string {
    if (!body) {
        return `Transcription request failed with status ${status}`;
    }

    try {
        const parsed = JSON.parse(body) as TranscriptionErrorResponse | string;

        if (typeof parsed === "string") {
            return parsed;
        }

        if (parsed && typeof parsed === "object") {
            return parsed.error ?? parsed.message ?? body;
        }
    } catch {
        return body;
    }

    return body;
}

export async function uploadAudioForTranscription(file: File, languageCode = "ne"): Promise<TranscriptionResponse> {
    const formData = new FormData();

    formData.append("file", file);
    formData.append("languageCode", languageCode);

    const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
    });

    const text = await response.text();

    if (!response.ok) {
        throw new Error(getErrorMessage(text, response.status));
    }

    try {
        const parsed = JSON.parse(text) as Partial<TranscriptionResponse>;

        return {
            transcript: typeof parsed.transcript === "string" ? parsed.transcript : "",
        };
    } catch {
        throw new Error("Invalid transcription response from the server.");
    }
}