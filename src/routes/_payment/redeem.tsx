import { redeemCouponService } from '#/server/billing/redeem.ts';
import { createFileRoute, redirect } from '@tanstack/react-router'
import { toast } from 'sonner';

export const Route = createFileRoute('/_payment/redeem')({
    component: RouteComponent,
    beforeLoad: async ({ context }) => {
        if (!context.session) {
            throw redirect({ to: "/authenticate", search: { type: "signup" } })
        }
    }
})

function RouteComponent() {
    const { session } = Route.useRouteContext()

    const handleCodeRedemption = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()

        const formData = new FormData(e.currentTarget)
        const code = formData.get("code") as string

        try {
            const { credits, success } = await redeemCouponService({
                code,
                userId: session?.user.id ?? ""
            })

            if (success) {
                toast.success(`Successfully redeemed ${credits} to your account`)
            }
        } catch (error) {
            toast.error(`Failed to redeem because: ${String(error)}`)
        }
    }

    return (
        <>
            <div>
                <h1>Redeem Code</h1>

                <form onSubmit={handleCodeRedemption} method="post" action={"#"}>
                    <input type="text" name="code" placeholder="RELAY1" />
                    <button>Redeem</button>
                </form>
            </div>
        </>
    )
}
