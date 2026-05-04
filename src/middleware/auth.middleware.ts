import { auth } from "#/lib/auth";
import type { AppContext } from "#/types/router-context";
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

export const getSessionMiddleware = createMiddleware({ type: "request" }).server(
    async ({ next }) => {
        const headers = getRequestHeaders()
        const session = await auth.api.getSession({ headers })

        return await next({ context: { session: session } satisfies AppContext })
    }
)