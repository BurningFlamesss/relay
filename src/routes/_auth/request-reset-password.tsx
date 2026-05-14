import { clientEnv } from '#/env/client.ts';
import { authClient } from '#/lib/auth-client.ts';
import { requestResetPasswordSchema } from '#/schema/auth.tsx';
import { createFileRoute, Link } from '@tanstack/react-router'
import { toast } from 'sonner';

export const Route = createFileRoute('/_auth/request-reset-password')({
    component: RouteComponent,
})

function RouteComponent() {

    const handleRequestPasswordReset = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()

        const formData = new FormData(e.currentTarget)
        const email = formData.get("email") as string
        const requestResetPasswordData = {
            email
        }

        const { success, data, error } = requestResetPasswordSchema.safeParse(requestResetPasswordData)

        if (!success) {
            Object.values(error.flatten().fieldErrors).forEach(errors => errors.forEach(err => toast.error(err.replaceAll("string", "email"))))
            return
        }

        try {
            await authClient.requestPasswordReset({
                ...requestResetPasswordData,
                redirectTo: `${clientEnv.VITE_APP_URL}/reset-password`
            }, {
                onError: (context) => {
                    toast.error(context.error.message)
                },
                onSuccess: () => {
                    toast.success(`Reset password email is sent to ${email}`)
                }
            })
        } catch (err) {
            toast.error(`Something went wrong: ${err}`)
        }
    }

    return (
        <>
            <form onSubmit={handleRequestPasswordReset} method="post" action={"#"}>
                Email: <input type="email" name="email" required /> <br />
                <button type="submit">Request Reset Password</button> <br />
                <Link to="/authenticate" search={{ type: "signin" }}>Back to signin</Link>
            </form>
        </>
    )
}
