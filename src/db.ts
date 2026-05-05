import { withAccelerate } from '@prisma/extension-accelerate'
import { PrismaClient } from './generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
})

const createPrismaClient = () =>
  new PrismaClient({ adapter }).$extends(withAccelerate())

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>

declare global {
  var __prisma: ExtendedPrismaClient | undefined
}

export const prisma: ExtendedPrismaClient =
  globalThis.__prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma
}