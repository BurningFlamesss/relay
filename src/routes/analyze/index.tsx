import type { Stage } from '#/hooks/useAnalysis'
import { useAnalysis } from '#/hooks/useAnalysis'
import { createFileRoute } from '@tanstack/react-router'
import React, { useRef } from 'react'

export const Route = createFileRoute('/analyze/')({
  beforeLoad({ context }) {
    // TODO: Verify the session
  },
  component: RouteComponent,
})

const STAGE_LABELS: Record<Stage, string> = {
  idle: "Ready",
  processing: "Starting...",
  confirmed: "Request confirmed",
  thinking: "Thinking...",
  researching: "Researching signals...",
  evaluating: "Evaluating clusters...",
  stitching: "Stitching insights...",
  done: "Done",
  error: "Something went wrong"
}

function RouteComponent() {
  const { stage, isRunning, result, error, run, jobId, reset } = useAnalysis()
  const inputRef = useRef<HTMLInputElement | null>(null)

  const handleSubmit = () => {
    const value = inputRef.current?.value.trim()
    if (!value) return
    run({ topic: value })
  }

  const handleKeydown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSubmit()
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        placeholder="Enter the topic to analyze"
        disabled={isRunning}
        type="text"
        onKeyDown={handleKeydown}
      />

      <button
        onClick={handleSubmit}
        disabled={isRunning}
        type='submit'>
        {isRunning ? "Analyzing..." : "Analyze"}
      </button>

      {!["idle"].includes(stage) ? (
        <p>{STAGE_LABELS[stage]}</p>
      ) : null}

      {result && (
        <div>
          <p>{result}</p>
          <button onClick={reset} type="reset">
            Reset
          </button>
        </div>
      )}

      {error && (
        <div>
          <p>{error}</p>
          <button onClick={reset} type="reset">
            Reset
          </button>
        </div>
      )}
    </>
  )
}
