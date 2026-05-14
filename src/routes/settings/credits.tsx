import { getRecentTransaction } from '#/server/billing/transactions.ts';
import { getWalletSummary } from '#/server/billing/wallet.ts';
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/credits')({
  component: RouteComponent,
  loader: async ({ context }) => {
    const userId = context.session?.user.id

    if (!userId) {
      throw redirect({ to: "/authenticate", search: { type: "signup" } })
    }

    const [wallet, transactions] = await Promise.all([getWalletSummary(userId), getRecentTransaction(userId)])

    return {
      wallet,
      transactions
    }
  }
})

function RouteComponent() {
  const { wallet, transactions } = Route.useLoaderData()

  return (
    <>
      <div>
        <h1>
          Research Balance
        </h1>

        <p>
          {wallet?.balance ?? 0} credits
        </p>

        <br />

        <h1>Recent Activity</h1>

        {transactions.map(transaction => (
          <div key={transaction.id}>
            <p>{transaction.description}</p>
            <p>"{transaction.amount}" credits</p>
          </div>
        ))}
      </div>
    </>
  )
}
