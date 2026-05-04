import type { auth } from "@/lib/auth";

export type Session = Awaited<
    ReturnType<typeof auth.api.getSession>
>;

export type AppContext = {
    session: Session;
}