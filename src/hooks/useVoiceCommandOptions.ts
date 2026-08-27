import { serializeVoiceContext } from "#/features/voice/serialize-voice-context.ts";
import { createSpeechRecognitionSession, type SpeechRecognitionSession } from "#/features/voice/speech-recognition.ts";
import { uploadAudioForTranscription } from "#/features/voice/transcribe.ts";
import { parseIntent } from "#/server/functions/intent.ts";
import type { VoiceCommandContext, VoiceCommandResult, VoiceState } from "#/types/voice.ts";
import { useEffect, useRef, useState } from "react";

export interface UseVoiceCommandOptions {
    context: VoiceCommandContext;
    onCommand?: (result: VoiceCommandResult) => void | Promise<void>;
    onError?: (error: Error) => void;
    minConfidence?: number;
    maxDurationMs?: number;
}

export interface UseVoiceCommandReturn {
    state: VoiceState;
    isRecording: boolean;
    isProcessing: boolean;
    result: VoiceCommandResult | null;
    transcript: string | null;
    error: Error | null;
    start: () => Promise<void>;
    stop: () => void;
    reset: () => void;
}

const getExtension = (mime: string) => {
    if (mime.includes("ogg")) return "ogg";
    if (mime.includes("mp4")) return "mp4";

    return "webm";
};

export function useVoiceCommand({
    context,
    onCommand,
    onError,
    minConfidence = 0.70,
    maxDurationMs = 30_000
}: UseVoiceCommandOptions): UseVoiceCommandReturn {
    const [state, setState] = useState<VoiceState>("idle");
    const [result, setResult] = useState<VoiceCommandResult | null>(null);
    const [transcript, setTranscript] = useState<string | null>(null);
    const [error, setError] = useState<Error | null>(null);

    const isProcessing = state === "transcribing" || state === "parsing";
    const isRecording = state === "recording";

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const speechRecognitionRef = useRef<SpeechRecognitionSession | null>(null);
    const chunksRef = useRef<Array<Blob>>([]);
    const startTimeRef = useRef<number>(0);
    const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sessionIdRef = useRef(0);
    const startLockRef = useRef(false);
    const stopRequestedRef = useRef(false);
    const speechRecognitionStopPromiseRef = useRef<Promise<string> | null>(null);

    const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isGracePeriodActiveRef = useRef(false);

    const stopStream = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    };

    const clearTimer = () => {
        if (maxTimerRef.current) {
            clearTimeout(maxTimerRef.current);
            maxTimerRef.current = null;
        }
    };

    const clearGraceTimer = () => {
        if (graceTimerRef.current) {
            clearTimeout(graceTimerRef.current);
            graceTimerRef.current = null;
        }
        isGracePeriodActiveRef.current = false;
    };

    const isCurrentSession = (sessionId: number) => sessionId === sessionIdRef.current;

    const releaseResources = () => {
        mediaRecorderRef.current = null;
        speechRecognitionRef.current = null;
        speechRecognitionStopPromiseRef.current = null;
        startLockRef.current = false;
        stopRequestedRef.current = false;
        chunksRef.current = [];

        clearTimer();
        clearGraceTimer();
        stopStream();
    };

    const fail = (error: Error, sessionId: number) => {
        if (!isCurrentSession(sessionId)) return;

        speechRecognitionRef.current?.abort();

        releaseResources();
        setState("error");
        setError(error);
        onError?.(error);
    };

    const stopRecognition = async (sessionId: number) => {
        const recognition = speechRecognitionRef.current;

        if (!recognition || !isCurrentSession(sessionId)) return "";

        if (!speechRecognitionStopPromiseRef.current) {
            speechRecognitionStopPromiseRef.current = recognition.stop();
        }

        try {
            return await speechRecognitionStopPromiseRef.current;
        } catch {
            return "";
        }
    };

    const processBlob = async (
        blob: Blob | null,
        mimeType: string,
        sessionId: number,
        fallbackTranscriptPromise: Promise<string>,
        durationMs: number,
    ) => {
        if (!isCurrentSession(sessionId)) return;

        setState("transcribing");

        let rawTranscript = "";
        let uploadError: Error | null = null;

        if (blob && blob.size > 0) {
            const file = new File([blob], `recording.${getExtension(mimeType)}`, { type: mimeType });

            try {
                const response = await uploadAudioForTranscription(file, context.language ?? "ne");
                rawTranscript = response.transcript.trim();
            } catch (error) {
                uploadError = error as Error;
            }
        }

        const recognitionTranscript = await fallbackTranscriptPromise;

        if (!rawTranscript) rawTranscript = recognitionTranscript.trim();

        if (!rawTranscript && durationMs < 500) {
            if (isCurrentSession(sessionId)) reset();

            return;
        }

        if (!rawTranscript) {
            if (uploadError) return fail(uploadError, sessionId);

            return fail(new Error("No speech detected."), sessionId);
        }

        if (!isCurrentSession(sessionId)) return;

        setTranscript(rawTranscript);

        try {
            setState("parsing");
            const serializableContext = serializeVoiceContext(context);

            const { commands } = await parseIntent({
                data: { transcript: rawTranscript, context: serializableContext },
            });

            const gated = commands.map((command) => command.confidence < minConfidence
                ? { type: "unknown" as const, confidence: command.confidence, rawTranscript }
                : command
            );

            const finalResult: VoiceCommandResult = {
                command: gated,
                transcript: rawTranscript,
                durationMs: Date.now() - startTimeRef.current,
            };

            setResult(finalResult);
            setState("ready");
            onCommand?.(finalResult);

        } catch (error) {
            return fail(error as Error, sessionId);
        } finally {
            if (isCurrentSession(sessionId)) releaseResources();
        }
    };

    useEffect(() => {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => stream.getTracks().forEach(track => track.stop()))
            .catch(() => { });

        return () => {
            sessionIdRef.current += 1;
            const recorder = mediaRecorderRef.current;
            if (recorder && recorder.state === "recording") {
                try {
                    recorder.stop()
                } catch {

                }
            }
            speechRecognitionRef.current?.abort();

            releaseResources();
        };
    }, []);

    const start = async () => {
        if (startLockRef.current || state === "recording" || isProcessing) return;

        const sessionId = ++sessionIdRef.current;
        startLockRef.current = true;
        stopRequestedRef.current = false;

        setError(null);
        setResult(null);
        setTranscript(null);

        chunksRef.current = [];

        speechRecognitionRef.current?.abort();
        speechRecognitionRef.current = null;
        speechRecognitionStopPromiseRef.current = null;

        clearTimer();
        clearGraceTimer();
        stopStream();

        mediaRecorderRef.current = null;

        let stream: MediaStream;

        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            startLockRef.current = false;
            return fail(new Error("Microphone access denied. Please allow microphone permissions."), sessionId);
        }

        if (!isCurrentSession(sessionId)) {
            stream.getTracks().forEach(track => track.stop());
            startLockRef.current = false;

            return;
        }

        streamRef.current = stream;

        const speechRecognition = createSpeechRecognitionSession(context.language ?? "ne");

        if (speechRecognition && speechRecognition.start()) {
            speechRecognitionRef.current = speechRecognition;
            speechRecognitionStopPromiseRef.current = null;
        }

        const SUPPORTED_MIME_TYPES = [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/ogg;codecs=opus",
            "audio/mp4"
        ];

        const mimeType = SUPPORTED_MIME_TYPES.find(type => MediaRecorder.isTypeSupported(type)) ?? "";

        let recorder: MediaRecorder;

        try {
            recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        } catch (error) {
            startLockRef.current = false;

            return fail(error instanceof Error ? error : new Error("MediaRecorder not supported."), sessionId);
        }

        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = event => {
            if (event.data.size > 0) chunksRef.current.push(event.data);
        };

        recorder.onstop = async () => {
            if (!isCurrentSession(sessionId)) return;

            clearTimer();
            clearGraceTimer();

            const fallbackTranscriptPromise = stopRecognition(sessionId);

            stopStream();

            const blob = chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: mimeType }) : null;

            const duration = Date.now() - startTimeRef.current;

            await processBlob(blob, mimeType, sessionId, fallbackTranscriptPromise, duration);
        };

        recorder.onerror = (event) => {
            if (!isCurrentSession(sessionId)) return;

            fail(new Error(`MediaRecorder: ${event.error?.message ?? "unknown error"}`), sessionId);
        };

        try {
            recorder.start();
        } catch (error) {
            startLockRef.current = false;

            return fail(error instanceof Error ? error : new Error("Unable to start audio recorder."), sessionId);
        }

        startTimeRef.current = Date.now();
        setState("recording");

        setTimeout(() => {
            if (isCurrentSession(sessionId)) startLockRef.current = false;
        }, 0);

        maxTimerRef.current = setTimeout(() => {
            if (mediaRecorderRef.current?.state === "recording") {
                clearGraceTimer();
                mediaRecorderRef.current.stop();
            }
        }, maxDurationMs);

        if (stopRequestedRef.current) stop();
    };

    const stop = () => {
        stopRequestedRef.current = true;
        clearTimer();

        const duration = Date.now() - startTimeRef.current;
        const MIN_RECORDING_MS = 300;

        if (duration < MIN_RECORDING_MS && state === "recording") {
            reset();
            return;
        }

        if (state === "recording" && !isGracePeriodActiveRef.current) {
            isGracePeriodActiveRef.current = true;
            setState("transcribing");

            graceTimerRef.current = setTimeout(() => {
                if (!isCurrentSession(sessionIdRef.current)) return;

                const recorder = mediaRecorderRef.current;

                if (recorder && recorder.state === "recording") {
                    recorder.stop();
                }
                isGracePeriodActiveRef.current = false;
                graceTimerRef.current = null;
            }, 500);

            return;
        }

        if (isGracePeriodActiveRef.current) return;

        const recognition = speechRecognitionRef.current;

        if (recognition && !speechRecognitionStopPromiseRef.current) {
            speechRecognitionStopPromiseRef.current = recognition.stop();
        }

        const recorder = mediaRecorderRef.current;

        if (!recorder) return;

        if (recorder.state === "recording") {
            stopRequestedRef.current = false;
            recorder.stop();

            return;
        }

        if (startLockRef.current) {
            stopRequestedRef.current = true;
        }
    };

    const reset = () => {
        sessionIdRef.current += 1;
        stopRequestedRef.current = false;
        startLockRef.current = false;

        clearGraceTimer();

        const recorder = mediaRecorderRef.current;

        if (recorder && recorder.state === "recording") {
            try {
                recorder.stop()
            } catch {

            }
        }

        speechRecognitionRef.current?.abort();
        speechRecognitionStopPromiseRef.current = null;

        releaseResources();
        setError(null);
        setResult(null);
        setTranscript(null);
        setState("idle");
    };

    return {
        state,
        result,
        transcript,
        error,
        start,
        stop,
        reset,
        isProcessing,
        isRecording
    };
}