interface SpeechRecognitionAlternativeLike {
    transcript: string;
}

interface SpeechRecognitionResultLike
    extends ArrayLike<SpeechRecognitionAlternativeLike> {
    isFinal: boolean;
}

interface SpeechRecognitionEventLike {
    resultIndex: number;
    results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
    continuous: boolean;
    interimResults: boolean;
    lang: string;

    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    onerror: (() => void) | null;
    onend: (() => void) | null;

    start: () => void;
    stop: () => void;
    abort: () => void;
}

interface WindowWithSpeechRecognition extends Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
}

export interface SpeechRecognitionSession {
    start: () => boolean;
    stop: () => Promise<string>;
    abort: () => void;
    getTranscript: () => string;
}

function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionLike) | null {
    if (typeof window === "undefined") return null;

    const browserWindow = window as WindowWithSpeechRecognition;

    return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
}

export function createSpeechRecognitionSession(languageCode: string): SpeechRecognitionSession | null {
    const SpeechRecognition = getSpeechRecognitionConstructor();

    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    let started = false;

    let finalTranscript = "";
    let interimTranscript = "";

    let stopResolve: ((value: string) => void) | null = null;
    let stopPromise: Promise<string> | null = null;

    const getRawTranscript = () => `${finalTranscript} ${interimTranscript}`.replace(/\s+/g, " ").trim();

    const getTranscript = () => getRawTranscript();

    const finalize = () => {
        started = false;

        if (stopResolve) {
            stopResolve(getTranscript());
            stopResolve = null;
            stopPromise = null;
        }
    };

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = languageCode;

    recognition.onresult = (event) => {
        interimTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const text = result[0]?.transcript ?? "";

            if (result.isFinal) {
                finalTranscript += `${text} `;
            } else {
                interimTranscript += text;
            }
        }
    };

    recognition.onerror = () => finalize();

    recognition.onend = () => setTimeout(finalize, 200);

    return {
        start() {
            if (started) return false;

            finalTranscript = "";
            interimTranscript = "";
            started = true;

            try {
                recognition.start();

                return true;
            } catch {
                started = false;

                return false;
            }
        },
        stop() {
            if (!started) return Promise.resolve(getTranscript());

            if (!stopPromise) {
                stopPromise = new Promise<string>((resolve) => {
                    stopResolve = resolve;
                });
                recognition.stop();
            }

            return stopPromise;
        },
        abort() {
            started = false;

            try {
                recognition.abort();
            } catch {

            }

            finalize();
        },
        getTranscript,
    };
}