import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/analyze/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/analyze/"!</div>
}
