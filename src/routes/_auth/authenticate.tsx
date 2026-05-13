import { authClient } from '#/lib/auth-client.ts';
import { authSearchParam, signinSchema, signupSchema } from '#/schema/auth.tsx';
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import React from 'react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_auth/authenticate')({
    component: RouteComponent,
    beforeLoad: ({ context }) => {
        if (context.session) {
            throw redirect({ to: "/" })
        }
    },
    validateSearch: authSearchParam
})

function RouteComponent() {
    const { type } = Route.useSearch()

    const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()

        const formData = new FormData(e.currentTarget)
        const email = formData.get("email") as string
        const password = formData.get("password") as string
        const signInData = {
            email, password
        }

        const { success, data, error } = signinSchema.safeParse(signInData)

        if (!success) {
            Object.values(error.flatten().fieldErrors).forEach(errors => errors.forEach(err => toast.error(err.replaceAll("string", "field"))))
            return
        }


        try {
            await authClient.signIn.email({
                ...signInData,
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
        } catch (err) {
            toast.error(`Something went wrong: ${String(err)}`)

        }
    }

    const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()

        const formData = new FormData(e.currentTarget)
        const name = formData.get("name") as string
        const email = formData.get("email") as string
        const password = formData.get("password") as string
        const signUpData = {
            name, email, password
        }

        const { success, data, error } = signupSchema.safeParse(signUpData)

        if (!success) {
            Object.values(error.flatten().fieldErrors).forEach(errors => errors.forEach(err => toast.error(err.replaceAll("string", "field"))))
            return
        }

        try {
            await authClient.signUp.email({
                ...signUpData,
                // callbackURL: "/"
            }, {
                onError: (context) => {
                    toast.error(context.error.message)
                },
                onSuccess: () => {
                    toast.success(`An verification email is sent to ${email}`)
                }
            })

        } catch (err) {
            toast.error(`Something went wrong: ${String(err)}`)
        }
    }

    return (
        <>
            {
                type === "signin" ? (
                    <form onSubmit={handleSignIn} action={"#"} method={"post"}>
                        Email: <input type="email" name="email" required /> <br />
                        Password: <input type="password" name="password" required /> <br />
                        <Link to="/request-reset-password">Forget Password?</Link> <br />
                        <button type="submit">SignIn</button>
                    </form>
                ) : (
                    <form onSubmit={handleSignUp} action={"#"} method={"post"}>
                        Name: <input type="text" name="name" required /> <br />
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
