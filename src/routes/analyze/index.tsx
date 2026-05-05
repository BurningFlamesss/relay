import { useAnalysis } from '#/hooks/useAnalysis'
import { createFileRoute } from '@tanstack/react-router'
import { useRef } from 'react'

export const Route = createFileRoute('/analyze/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { stage, result, error, run, jobId, reset } = useAnalysis()
  const inputRef = useRef<HTMLInputElement | null>(null)

  return (
    <>
      <input ref={inputRef} type="text" />
      <button onClick={() => {
        const value = inputRef.current?.value.trim()
        if (!value) return
        run({ topic: value })
      }} type='submit'>Submit</button>
      <div>
        {stage}, {error}
      </div>
    </>
  )
}
