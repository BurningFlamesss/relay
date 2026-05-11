import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_payment/billing/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_payment/billing/"!</div>
}
