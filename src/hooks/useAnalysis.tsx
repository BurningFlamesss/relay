import type { AnalyzeSchema } from "#/schema/analyze";
import { useRef, useState } from "react";
import type { z } from "zod";

type Stage = "idle" | string

type Input = z.infer<typeof AnalyzeSchema>

export function useAnalysis() {
    const [stage, setStage] = useState<Stage>("idle")
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<string | null>(null)
    const abortRef = useRef<AbortController | null>(null)

    const run = async (input: Input) => {
        abortRef.current?.abort()
        abortRef.current = new AbortController()

        setStage("processing")

        try {
            
            const response = await fetch("/api/analyze", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(input),
                signal: abortRef.current.signal
            })

            if (!response.ok) {
                const e = await response.json()
                setError(e.error ?? "Something went wrong")
                setStage("error")
                return
            }

            const reader = response.body!.getReader()
            const decoder = new TextDecoder()

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const lines = decoder.decode()

            }

        } catch (e: any) {
            if (e.name == "AbortError") return
            setError("Connection Lost")
            setStage("error")
        }
    }

    const connectSSE = (jobId: string) => {

    }

    const close = () => {
        abortRef.current?.abort()
        setStage("idle")
    }

    return {
        stage, result, error, run, close
    }
}