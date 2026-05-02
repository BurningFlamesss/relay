import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/cofounder/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/cofounder/"!</div>
}
