import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_payment/redeem')({
    component: RouteComponent,
})

function RouteComponent() {
    return (
        <>
            Coupon: <input type="text" name="coupon" />
        </>
    )
}
