import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_payment/billing/$packId')({
  component: RouteComponent,
})

function RouteComponent() {
  const { packId } = Route.useParams()
  return (
    <>
      <div>Billing</div>
      Coupon: <input type="text" name="coupon" />
    </>
  )
}
