import { prisma } from '#/db.ts';
import { createFileRoute } from '@tanstack/react-router'
import React from 'react';

export const Route = createFileRoute('/_payment/pricing')({
  component: RouteComponent,
  loader: async () => {
    return await prisma.creditPack.findMany({
      where: {
        isActive: true
      },
      orderBy: {
        sortOrder: "desc"
      }
    })
  }
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
      {packs?.map(pack => {
        return (
          <React.Fragment key={pack.id}>
            <h1>{pack.name}</h1>
            <p>{pack.price} {pack.currency} for {pack.credits} credits</p>
          </React.Fragment>
        )
      })}
    </>
  )
}
