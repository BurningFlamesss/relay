import { prisma } from '#/db'
import { clientEnv } from '#/env/client.ts';
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
      console.table({ user, url, token, request })
    },
    resetPasswordTokenExpiresIn: 1000 * 60 * 20,

    onExistingUserSignUp: async ({ user }, request) => {
      console.table({
        to: user.email,
        subject: "Sign-up attempt with your email",
        message: "Someone tried to create an account using your email address. If this was you, try signing in instead. If not, you can safely ignore this email."
      })
    }
  },

  emailVerification: {
    autoSignInAfterVerification: true,
    sendOnSignUp: true,
    async sendVerificationEmail({ user, url, token }, request) {
      console.table({ user, url, token, request })
    },
    expiresIn: 1000 * 60 * 20
  },

  baseURL: clientEnv.VITE_APP_URL,

  plugins: [tanstackStartCookies()],
})
