import { authClient } from '#/lib/auth-client.ts';
import { authSearchParam } from '#/schema/auth.tsx';
import { createFileRoute, Link } from '@tanstack/react-router'
import React from 'react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_auth/authenticate')({
    component: RouteComponent,
    validateSearch: authSearchParam
})

function RouteComponent() {
    const { type } = Route.useSearch()

    const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()

        const formData = new FormData(e.currentTarget)

        try {
            await authClient.signIn.email({
                email: formData.get("email") as string,
                password: formData.get("password") as string,
                callbackURL: "/"
            }, {
                onError: (context) => {
                    if (context.error.status === 403) {
                        toast.error("Please verify you email")
                    } else {
                        toast.error(context.error.message)
                    }
                },
                onSuccess: () => {
                    toast.success("Signed In!!!")
                }
            })
        } catch (error) {
            toast.error(`Something went wrong: ${error}`)

        }
    }

    const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()

        const formData = new FormData(e.currentTarget)
        const email = formData.get("email") as string

        try {
            await authClient.signUp.email({
                name: formData.get("name") as string,
                email,
                password: formData.get("password") as string,
                callbackURL: "/"
            }, {
                onError: (context) => {
                    toast.error(context.error.message)
                },
                onSuccess: () => {
                    toast.success(`An verification email is sent to ${email}`)
                }
            })

        } catch (error) {
            toast.error(`Something went wrong: ${error}`)
        }
    }

    return (
        <>
            {
                type === "signin" ? (
                    <form onSubmit={handleSignIn}>
                        Email: <input type="email" name="email" required /> <br />
                        Password: <input type="password" name="password" required /> <br />
                        <Link to="/request-reset-password">Forget Password?</Link> <br />
                        <button type="submit">SignIn</button>
                    </form>
                ) : (
                    <form onSubmit={handleSignUp}>
                        Name: <input type="name" name="name" required /> <br />
                        Email: <input type="email" name="email" required /> <br />
                        Password: <input type="password" name="password" required /> <br />
                        <button type="submit">SignUp</button>
                    </form>
                )
            }

            <Link to="/authenticate" search={{ type: type === "signin" ? "signup" : "signin" }}>
                Goto: {type === "signin" ? "signup" : "signin"}
            </Link>
        </>
    )
}
