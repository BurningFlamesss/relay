import { prisma } from '#/db'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql"
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,

    async sendResetPassword({ user, url, token }, request) {
      console.table({user, url, token, request})
    },
    resetPasswordTokenExpiresIn: 1000 * 60 * 60,
  },

  emailVerification: {
    autoSignInAfterVerification: true,
    sendOnSignUp: true,
    async sendVerificationEmail({ user, url, token }, request) {
      console.table({user, url, token, request})
    },
  },

  baseURL: import.meta.env.BETTER_AUTH_URL,

  plugins: [tanstackStartCookies()],
})
