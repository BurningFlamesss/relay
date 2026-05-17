import { getRecentTransaction } from '#/server/billing/transactions.ts';
import { getWalletSummary } from '#/server/billing/wallet.ts';
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react';

type RecentTransaction = Awaited<ReturnType<typeof getRecentTransaction>>[number]

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
  const [optimisticDelta, setOptimisticDelta] = useState(0)

  useEffect(() => {
    try {
      const pending = +(sessionStorage.getItem("pendingCredits") || 0)

      if (!Number.isNaN(pending) && pending > 0) {
        setOptimisticDelta(pending)
        sessionStorage.removeItem("pendingCredits")
      }
    } catch (error) {
      
    }
  }, [])

  const displayedBalance = (wallet.balance ?? 0) + optimisticDelta
  

  return (
    <>
      <div>
        <h1>
          Research Balance
        </h1>

        <p>
          {displayedBalance} credits
        </p>

        <br />

        <h1>Recent Activity</h1>

        {transactions.map((transaction: RecentTransaction) => (
          <div key={transaction.id}>
            <p>{transaction.description}</p>
            <p>"{transaction.amount}" credits</p>
          </div>
        ))}
      </div>
    </>
  )
}
