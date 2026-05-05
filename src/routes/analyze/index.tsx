import { useAnalysis } from '#/hooks/useAnalysis'
import { createFileRoute } from '@tanstack/react-router'
import { useRef } from 'react'

export const Route = createFileRoute('/analyze/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { stage, result, error, run, close } = useAnalysis()
  const inputRef = useRef<HTMLInputElement | null>(null)

  return (
    <>
      <input ref={inputRef} type="text" />
      <button onClick={() => run({
        topic: inputRef.current!.value
      })} type='submit'>Submit</button>
      <div>
        {stage}, {error}
      </div>
    </>
  )
}
