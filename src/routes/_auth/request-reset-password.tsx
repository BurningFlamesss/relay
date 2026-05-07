import { authClient } from '#/lib/auth-client.ts';
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

        try {
            await authClient.requestPasswordReset({
                email,
                redirectTo: `${process.env.BETTER_AUTH_URL}/reset-password`
            })
            toast.success(`Reset password email is sent to ${email}`)
        } catch (error) {
            toast.error(`Something went wrong: ${error}`)
        }

    }

    return (
        <>
            <form onSubmit={handleRequestPasswordReset}>
                Email: <input type="email" name="email" required /> <br />
                <button type="submit">Request Reset Password</button> <br />
                <Link to="/authenticate" search={{ type: "signin" }}>Back to signin</Link>
            </form>
        </>
    )
}
