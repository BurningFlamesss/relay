import { serverEnv } from '#/env/server.ts';
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { sendEmails } from '@/features/sendEmail';


const { prisma } = await import("#/db")

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql"
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,

    async sendResetPassword({ user, url, token }, request) {
      console.table({ user, url, token })
      await sendEmails({
        type: "reset",
        receiverEmail: user.email,
        receiverName: user.name,
        token: url,
        callToAction: "Reset Your Password"
      })
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
      console.table({ user, url, token })
      await sendEmails({
        type: "verify",
        receiverEmail: user.email,
        receiverName: user.name,
        token: url,
        callToAction: "Verify Your Email"
      })
    },
    expiresIn: 1000 * 60 * 20
  },

  baseURL: serverEnv.BETTER_AUTH_URL,

  plugins: [tanstackStartCookies()],
})
