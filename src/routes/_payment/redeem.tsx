import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_payment/redeem')({
    component: RouteComponent,
})

function RouteComponent() {
    return (
        <>
            <div>
                <h1>Redeem Code</h1>

                <form action="">
                    <input type="text" name="code" placeholder="RELAY1" />
                    <button>Redeem</button>
                </form>
            </div>
        </>
    )
}
