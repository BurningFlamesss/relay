import type { auth } from "@/lib/auth";
import type { QueryClient } from "@tanstack/react-query";

export type Session = Awaited<
    ReturnType<typeof auth.api.getSession>
>;

export type AppContext = {
    session: Session;
}


export interface MyRouterContext {
    queryClient: QueryClient;
    session: Session | null
}