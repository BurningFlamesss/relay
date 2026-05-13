import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/credits')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/settings/credit"!</div>
}
