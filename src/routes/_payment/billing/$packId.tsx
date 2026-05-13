import { getBillingPack } from '#/server/billing/pricing.ts';
import { estimateIdeas, formatPrice } from '#/utils/index.ts';
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_payment/billing/$packId')({
  component: RouteComponent,
  loader: async ({ params }) => {
    return await getBillingPack({ data: params.packId })
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 10
})

function RouteComponent() {
  const pack = Route.useLoaderData()

  if (!pack) {
    return (
      <div>
        Pack not found
      </div>
    )
  }

  return (
    <>
      <div>Billing</div>

      <h1>{pack.name}</h1>
      <p>{formatPrice(pack.price, pack.currency)}</p>
      <p>{pack.creditAmount} credits   ~{estimateIdeas(pack.creditAmount)} analyzes</p>

      <form action="">
        <input type="text" name="coupon" placeholder="Enter coupon code" />
        <button>
          Apply Coupon
        </button>
      </form>

      <div>
        <button>
          Pay with Esewa
        </button>
        <br />
        <button>
          Pay with Stripe
        </button>
      </div>
    </>
  )
}
