import { useVoiceCommand } from "#/hooks/useVoiceCommandOptions.ts";
import { cn } from "#/lib/utils.ts";
import type { VoiceCommandContext, VoiceCommandResult } from "#/types/voice.ts";
import { useRef } from "react";
import type React from "react";
import { FaMicrophone, FaSpinner, FaStop } from "react-icons/fa6";

interface VoiceButtonProps {
    context: VoiceCommandContext;
    onCommand: (result: VoiceCommandResult) => void | Promise<void>;
    onError?: (error: Error) => void;
    minConfidence?: number;
    maxDurationMs?: number;
    className?: string;
    idleLabel?: string;
    children?: React.ReactNode;
}

export function VoiceButton({
    context,
    onCommand,
    onError,
    minConfidence,
    maxDurationMs,
    className = "",
    idleLabel = "Hold or press to speak",
    children,
}: VoiceButtonProps): React.ReactNode {

    const pointerInteractionRef = useRef(false)

    const { state, isRecording, isProcessing, transcript, error, start, stop, reset } = useVoiceCommand({
        context, onCommand, onError, minConfidence, maxDurationMs
    })

    const stateLabel: Record<typeof state, string> = {
        idle: idleLabel,
        recording: "Listening...",
        transcribing: "Transcribing...",
        parsing: "Understanding...",
        ready: "Done",
        error: "Error. Tap to retry"
    }

    const stateColor: Record<typeof state, string> = {
        idle: "#2563EB",
        recording: "#DC2626",
        transcribing: "#7C3AED",
        parsing: "#0F766E",
        ready: "#16A34A",
        error: "#B91C1C"
    }

    const handleClick = () => {
        if (pointerInteractionRef.current) return

        if (["idle", "ready", "error"].includes(state)) {
            if (["error", "ready"].includes(state)) reset()
            void start()
        } else if (isRecording) {
            stop()
        }
    }

    const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) return

        pointerInteractionRef.current = true

        if (["idle", "ready", "error"].includes(state)) {
            if (state !== "idle") reset()
            void start()
        }
    }

    const handlePointerUp = () => {
        stop()
        setTimeout(() => {
            pointerInteractionRef.current = false
        }, 0)
    }

    const handlePointerCancel = () => {
        stop()
        setTimeout(() => {
            pointerInteractionRef.current = false
        }, 0)
    }

    return (
        <div className={cn("inline-flex flex-col items-center gap-2", className)}>

            <button
                type="button"
                aria-label={stateLabel[state]}
                aria-pressed={isRecording}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onClick={!isProcessing ? handleClick : undefined}
                disabled={isProcessing}
                className={cn("w-18 h-18 rounded-full border-none text-white flex items-center justify-center", isProcessing ? "cursor-not-allowed" : "cursor-pointer", isRecording ? "scale-[1.08]" : "scale-100")}
                style={{ backgroundColor: stateColor[state] }}
            >
                {children ? children : isProcessing ? <FaSpinner /> : isRecording ? <FaStop /> : <FaMicrophone />}
            </button>

            <span className="text-xs font-medium" style={{ color: stateColor[state] }}>
                {stateLabel[state]}
            </span>

            {transcript && <span className="text-[11px] max-w-60 text-center text-[#6B7280] italic">"{transcript.slice(0, 10)}..."</span>}
            {error && <span className="text-[11px] max-w-60 text-center" style={{ color: stateColor.error }}>{error.message.slice(0, 10)}...</span>}
        </div>
    )
}