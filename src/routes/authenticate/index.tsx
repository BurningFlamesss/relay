import { authClient } from '#/lib/auth-client.ts';
import { authSearchParam } from '#/schema/auth.tsx';
import { createFileRoute, Link } from '@tanstack/react-router'
import React from 'react';

export const Route = createFileRoute('/authenticate/')({
    component: RouteComponent,
    validateSearch: authSearchParam
})

function RouteComponent() {
    const { type } = Route.useSearch()

    const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()

        const formData = new FormData(e.currentTarget)

        await authClient.signIn.email({
            email: formData.get("email") as string,
            password: formData.get("password") as string
        })
    }

    const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()

        const formData = new FormData(e.currentTarget)

        await authClient.signUp.email({
            name: formData.get("name") as string,
            email: formData.get("email") as string,
            password: formData.get("password") as string
        })
    }

    return (
        <>
            {
                type === "signin" ? (
                    <form onSubmit={handleSignIn}>
                        Email: <input type="email" name="email" /> <br />
                        Password: <input type="password" name="password" /> <br />
                        <button type="submit">SignIn</button>
                    </form>
                ) : (
                    <form onSubmit={handleSignUp}>
                        Name: <input type="name" name="name" /> <br />
                        Email: <input type="email" name="email" /> <br />
                        Password: <input type="password" name="password" /> <br />
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
