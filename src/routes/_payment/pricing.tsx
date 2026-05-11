import { getCreditPacks } from '#/server/billing/pricing.ts';
import { estimateIdeas, formatPrice } from '#/utils/index.ts';
import { createFileRoute } from '@tanstack/react-router'
import React from 'react';

export const Route = createFileRoute('/_payment/pricing')({
  component: RouteComponent,
  loader: async () => {
    return getCreditPacks()
  },
  gcTime: 1000 * 60 * 5
})

function RouteComponent() {
  const packs = Route.useLoaderData()

  if (!packs.length) {
    return (
      <div>
        No any packs available
      </div>
    )
  }

  return (
    <>
      {packs.map(pack => {
        return (
          <React.Fragment key={pack.id}>
            <h1>{pack.name}</h1>
            <p>{formatPrice(pack.price, pack.currency)}</p>
            <p>{pack.credits} credits   ~{estimateIdeas(pack.credits)} analyzes</p>
          </React.Fragment>
        )
      })}
    </>
  )
}
