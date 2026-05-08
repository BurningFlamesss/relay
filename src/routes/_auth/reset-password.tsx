import { authClient } from '#/lib/auth-client.ts';
import { resetPasswordParam, resetPasswordSchema } from '#/schema/auth.tsx';
import { createFileRoute, Link } from '@tanstack/react-router'
import type React from 'react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_auth/reset-password')({
  component: RouteComponent,
  validateSearch: resetPasswordParam
})

function RouteComponent() {
  const { token } = Route.useSearch()

  const handlePasswordReset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const formData = new FormData(e.currentTarget)
    const newPassword = formData.get("newPassword") as string
    const confirmPassword = formData.get("confirmPassword") as string

    const resetPasswordData = { newPassword }

    const { success, data, error } = resetPasswordSchema.safeParse(resetPasswordData)

    if (!success) {
      Object.values(error.flatten().fieldErrors).forEach(errors => errors.forEach(err => toast.error(err.replaceAll("string", "field"))))
      return
    }

    if (newPassword === confirmPassword) {
      try {
        await authClient.resetPassword({
          ...resetPasswordData,
          token: token,
        }, {
          onError: (context) => {
            toast.error(context.error.message)
          },
          onSuccess: () => {
            toast.success("Successfully reset password")
          }
        })
      } catch (err) {
        toast.error(`Something went wrong: ${err}`)
      }
    } else {
      toast.error("Please make sure both passwords matches each other identically")
    }
  }

  if (!token) {
    return (
      <>
        Please check your reset token in the email
      </>
    )
  }

  return (
    <>
      <form onSubmit={handlePasswordReset}>
        New Password: <input type="password" name="newPassword" required /> <br />
        Confirm Password: <input type="password" name="confirmPassword" required /> <br />
        <button type="submit">Reset Password</button> <br />
        <Link to="/authenticate" search={{ type: "signin" }}>Back to signin</Link>
      </form>
    </>
  )
}
