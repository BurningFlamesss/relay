import type { AnalyzeSchema } from "#/schema/analyze";
import { getLatestJobFn, startAnalyzeFn } from "#/server/functions/analyze";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";

export const STAGES = [
    "idle",
    "processing",
    "confirmed",
    "thinking",
    "researching",
    "evaluating",
    "stitching",
    "done",
    "error"
] as const

export type Stage = typeof STAGES[number]

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

            if (!latest) {
                fallbackToLocalStorage()
                return
            }

            if (latest.status === "completed") {
                setState(prev => ({
                    ...prev,
                    jobId: latest.id,
                    stage: "done",
                    result: latest.report
                }))
                localStorage.removeItem("analysisJobId")
                localStorage.removeItem("analysisStage")
                return
            }

            if (latest.status === "failed") {
                setState(prev => ({
                    ...prev,
                    jobId: latest.id,
                    stage: "error",
                    error: "Previous Analysis Failed"
                }))
                localStorage.removeItem("analysisJobId")
                localStorage.removeItem("analysisStage")
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
            fallbackToLocalStorage()
        }
    }

    const connectSSE = (jobId: string) => {
        if (esRef.current) return

        // esRef.current?.close()

        const es = new EventSource(`/api/stream/${jobId}`)
        esRef.current = es

        let retryCount = 0

        es.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data)
                const stage: Stage = data.stage

                setState(prev => ({
                    ...prev,
                    stage,
                    result: data.result ?? prev.result,
                    error: data.error ?? prev.error
                }))

                localStorage.setItem("analysisStage", stage)

                if (["error", "done"].includes(data.stage)) {
                    es.close()
                    esRef.current = null
                    localStorage.removeItem("analysisJobId")
                    localStorage.removeItem("analysisStage")
                }

            } catch (error) {
                setState(prev => ({
                    ...prev,
                    stage: "error",
                    error: "Failed to parse server response"
                }))
                es.close()
                esRef.current = null
            }
        }

        es.onerror = () => {
            if (retryCount < 3) {
                retryCount++

                es.close()
                esRef.current = null

                setTimeout(() => connectSSE(jobId), 1000 * retryCount)
                return
            }

            setState(prev => {
                if (prev.stage === "done") return prev

                return {
                    ...prev,
                    stage: "error",
                    error: "Connection lost. Please try again"
                }
            })

            es.close()
            esRef.current = null

            // localStorage.removeItem("analysisJobId")
            // localStorage.removeItem("analysisStage")
        }
    }

    const run = async (input: Input) => {
        setState(prev => ({
            ...INITIAL_STATE,
            stage: "processing"
        }))

        try {

            const { jobId } = await startAnalyzeFn({ data: input })

            localStorage.setItem("analysisJobId", jobId)
            localStorage.setItem("analysisStage", "processing")

            setState(prev => ({
                ...prev,
                jobId
            }))

            connectSSE(jobId)

        } catch (e) {
            setState(prev => ({
                ...INITIAL_STATE,
                stage: "error",
                error: "Failed to start analysis. Please try again"
            }))
        }
    }

    const reset = () => {
        esRef.current?.close()
        esRef.current = null
        localStorage.removeItem("analysisJobId")
        localStorage.removeItem("analysisStage")
        setState(INITIAL_STATE)
    }

    const fallbackToLocalStorage = () => {
        const savedJobId = localStorage.getItem("analysisJobId")
        const savedStage = localStorage.getItem("analysisStage") as Stage | null

        if (savedJobId && savedStage && !["done", "error"].includes(savedStage)) {
            setState(prev => ({
                ...prev,
                jobId: savedJobId,
                stage: savedStage
            }))
            connectSSE(savedJobId)
        } else {
            // localStorage.removeItem("analysisJobId")
            // localStorage.removeItem("analysisStage")
        }
    }

    return {
        stage: state.stage,
        isRunning: !["idle", "done", "error"].includes(state.stage),
        result: state.result,
        error: state.error,
        jobId: state.jobId,
        run,
        reset
    }
}

