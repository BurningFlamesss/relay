import type { AnalyzeSchema } from "#/schema/analyze";
import { getLatestJobFn, startAnalyzeFn } from "#/server/functions/analyze";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";

export type Stage = "idle" | "processing" | "confirmed" | "thinking" | "researching" | "evaluating" | "stitching" | "done" | "error"

type Input = z.infer<typeof AnalyzeSchema>

interface AnalysisState {
    stage: Stage;
    result: any | null;
    error: string | null;
    jobId: string | null;
}

const INITIAL_STATE: AnalysisState = {
    stage: "idle",
    result: null,
    error: null,
    jobId: null
}

export function useAnalysis() {
    const [state, setState] = useState<AnalysisState>(INITIAL_STATE)
    const esRef = useRef<EventSource | null>(null)

    useEffect(() => {
        rehydrate()

        return () => esRef.current?.close()
    }, [])

    const rehydrate = async () => {
        try {
            const latest = await getLatestJobFn()

            if (!latest) return

            if (latest.status === "complete") {
                setState(prev => ({
                    ...prev,
                    jobId: latest.id,
                    stage: "done",
                    result: latest.report
                }))
                sessionStorage.removeItem("analysisJobId")
                sessionStorage.removeItem("analysisStage")
                return
            }

            if (latest.status === "failed") {
                setState(prev => ({
                    ...prev,
                    jobId: latest.id,
                    stage: "error",
                    error: "Previous Analysis Failed"
                }))
                sessionStorage.removeItem("analysisJobId")
                sessionStorage.removeItem("analysisStage")
                return
            }
            
            if (latest.status === "in_progress") {
                setState(prev => ({
                    ...prev,
                    jobId: latest.id,
                    stage: latest.lastStage,
                }))
                connectSSE(latest.id)
                return
            }
        } catch (error) {
            sessionStorage.removeItem("analysisJobId")
            sessionStorage.removeItem("analysisStage")
        }
    }

    const connectSSE = (jobId: string) => {
        esRef.current?.close()

        const es = new EventSource(`/api/stream/${jobId}`)
        esRef.current = es

        es.onmessage = (e) => {
            const data = JSON.parse(e.data)
            setState(data.stage)

            if (data.stage === "done") {
                setState(data.result)
                es.close()
            }
        }

        es.onerror = () => {
            // TODO: Handle errors
        }
    }

    const run = async (input: Input) => {
        setState("processing")

        try {

            const { jobId } = await startAnalyzeFn({ data: input })
            connectSSE(jobId)

        } catch (e) {
            setState("error")
        }
    }



    const close = () => {
        esRef.current?.close()
        setState("idle")
    }

    return {
        state, result, error, run, close
    }
}