import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/analyze/')({
  component: RouteComponent,
})

function RouteComponent() {

  const run = (topic: string) => {

  }

  return <div>Hello "/analyze/"!</div>
}
