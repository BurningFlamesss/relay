import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/authenticate/')({
    component: RouteComponent,
})

function RouteComponent() {
    return <div>Hello "/authenticate/"!</div>
}
