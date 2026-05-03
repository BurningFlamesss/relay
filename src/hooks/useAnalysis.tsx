import type { AnalyzeSchema } from "#/schema/analyze";
import { startAnalyzeFn } from "#/server/functions/analyze";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";

type Stage = "idle" | "processing" | "confirmed" | "thinking" | "researching" | "evaluating" | "stitching" | "done" | "error" | string

type Input = z.infer<typeof AnalyzeSchema>

export function useAnalysis() {
    const [stage, setStage] = useState<Stage>("idle")
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<string | null>(null)
    const esRef = useRef<EventSource | null>(null)

    useEffect(() => {
        rehydrate()

        return () => esRef.current?.close()
    }, [])

    const rehydrate = async () => {
        // TODO: Add rehydrating logic

        // connectSSE("test123")
    }

    const connectSSE = (jobId: string) => {
        esRef.current?.close()

        const es = new EventSource(`/api/stream/${jobId}`)
        esRef.current = es

        es.onmessage = (e) => {
            const data = JSON.parse(e.data)
            setStage(data.stage)

            if (data.stage === "done") {
                setResult(data.result)
                es.close()
            }
        }

        es.onerror = () => {
            // TODO: Handle errors
        }
    }

    const run = async (input: Input) => {
        setStage("processing")
        setError(null)
        setResult(null)

        try {

            const { jobId } = await startAnalyzeFn({ data: input })
            connectSSE(jobId)

        } catch (e) {
            setError("Failed to start analysis")
            setStage("error")
        }
    }



    const close = () => {
        esRef.current?.close()
        setStage("idle")
    }

    return {
        stage, result, error, run, close
    }
}