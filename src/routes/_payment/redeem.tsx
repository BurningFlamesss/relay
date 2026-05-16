import { createFileRoute, redirect } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { formatError, normalizeCouponCode } from "#/utils/index.ts";
import type { InspectResult } from "#/types/billing.ts";
import { inspectCouponService } from "#/server/billing/_coupon/inspect.ts";
import { redeemCouponService } from "#/server/billing/_coupon/redeem.ts";

export const Route = createFileRoute("/_payment/redeem")({
    component: RouteComponent,
    beforeLoad: async ({ context }) => {
        if (!context.session) {
            throw redirect({ to: "/authenticate", search: { type: "signup" } })
        }
    },
})

const INSPECTION_STALE_TIME = 30_000

function RouteComponent() {
    const queryClient = useQueryClient()

    const [code, setCode] = useState("")
    const [debouncedCode, setDebouncedCode] = useState("")

    const lastToastRef = useRef<string | null>(null)

    const normalizedCode = useMemo(() => normalizeCouponCode(debouncedCode), [debouncedCode])

    useEffect(() => {
        const timer = setTimeout(() => { setDebouncedCode(code) }, 350)
        return () => clearTimeout(timer)
    }, [code])

    const inspectQuery = useQuery<InspectResult>({
        queryKey: ["coupon-inspect", normalizedCode],
        queryFn: () => inspectCouponService({ data: { code: normalizedCode } }),
        enabled: normalizedCode.length > 0,
        staleTime: INSPECTION_STALE_TIME,
        retry: false,
    })

    const showInspectionToast = useCallback((inspection: InspectResult, code_: string) => {
        const toastKey = JSON.stringify({
            code: code_,
            valid: inspection.valid,
            redeemable: inspection.redeemable,
            reason: inspection.reason,
        })

        if (lastToastRef.current === toastKey) {
            return
        }

        lastToastRef.current = toastKey

        if (!inspection.valid) {
            toast.error(inspection.reason || "Coupon is not valid")
            return
        }

        if (!inspection.redeemable) {
            if (inspection.redemptionType === "CHECKOUT") {
                toast.error("Coupon requires checkout")
                return
            }

            toast.error("Coupon is not redeemable")
        }
    },
        [],
    )

    const redeemMutation = useMutation({
        mutationFn: async (inputCode: string) => redeemCouponService({ data: { code: inputCode } }),

        onSuccess: ({ success, credits }, redeemedCode) => {
            if (!success) {
                toast.error("Failed to redeem coupon")
                return
            }

            toast.success(`Successfully redeemed ${credits} credits to your account`)

            try {
                const pending = +(sessionStorage.getItem("pendingCredits") || "0")

                sessionStorage.setItem("pendingCredits", String(pending + credits))
            } catch { }

            queryClient.removeQueries({ queryKey: ["coupon-inspect", redeemedCode] })

            setCode("")
            setDebouncedCode("")
        },

        onError: (error) => {
            toast.error(`Failed to redeem coupon: ${formatError(error)}`)
        },
    })

    const inspectCoupon = useCallback(async (inputCode: string) => {
        return queryClient.fetchQuery({
            queryKey: ["coupon-inspect", inputCode],
            queryFn: () => inspectCouponService({ data: { code: inputCode } }),
            staleTime: INSPECTION_STALE_TIME,
        })
    },
        [queryClient],
    )

    const handleBlur = async () => {
        const inputCode = normalizeCouponCode(code)

        if (!inputCode) return

        try {
            const result = await inspectCoupon(inputCode)

            showInspectionToast(result, inputCode)
        } catch (error) {
            toast.error(`Failed to inspect coupon: ${formatError(error)}`)
        }
    }

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()

        if (redeemMutation.isPending) return

        const inputCode = normalizeCouponCode(code)

        if (!inputCode) {
            toast.error("Please enter a coupon code")
            return
        }

        try {
            const cachedInspection = queryClient.getQueryData<InspectResult>(["coupon-inspect", inputCode])

            const inspection = cachedInspection ?? (await inspectCoupon(inputCode))

            if (!cachedInspection) showInspectionToast(inspection, inputCode)

            if (!inspection.valid || !inspection.redeemable) return

            await redeemMutation.mutateAsync(inputCode)

        } catch (error) {
            toast.error(`Failed to redeem coupon: ${formatError(error)}`)
        }
    }

    const inspection = inspectQuery.data
    const inspecting = inspectQuery.isFetching
    const redeeming = redeemMutation.isPending

    return (
        <div>
            <h1>Redeem Code</h1>

            <form onSubmit={handleSubmit}>
                <input
                    type="text"
                    name="code"
                    placeholder="RELAY1"
                    autoComplete="off"
                    spellCheck={false}
                    value={code}
                    disabled={redeeming}
                    onBlur={handleBlur}
                    onChange={(e) => { setCode(e.target.value.toUpperCase()) }}
                />

                <button
                    type="submit"
                    disabled={redeeming || inspecting || normalizeCouponCode(code).length === 0}
                >
                    {redeeming ? "Redeeming..." : inspecting ? "Checking..." : "Redeem"}
                </button>
            </form>

            {inspection && (
                <div>
                    {inspection.valid ? (
                        <p>
                            {inspection.redeemable
                                ? `Redeemable for ${inspection.creditsPreview ?? 0} credits`
                                : inspection.reason ||
                                (
                                    inspection.redemptionType === "CHECKOUT"
                                        ? "Valid but requires checkout"
                                        : "Coupon is not redeemable"
                                )
                            }
                        </p>
                    ) : (
                        <p>
                            {inspection.reason || "Coupon is not valid"}
                        </p>
                    )}

                    {inspection.remainingUses !== undefined && (
                        <p>
                            Remaining uses: {inspection.remainingUses ?? "Unlimited"}
                        </p>
                    )}

                    {inspection.perUserRemaining !== undefined && (
                        <p>
                            Remaining for you: {inspection.perUserRemaining}
                        </p>
                    )}

                    {inspection.applicablePacks && inspection.applicablePacks.length > 0 && (
                        <div>
                            <p>Applicable packs:</p>

                            {inspection.applicablePacks.map(
                                (pack) => (
                                    <p key={pack.id}>
                                        {pack.name} - {pack.creditAmount} <br />
                                        credits - {pack.price} {pack.currency}
                                    </p>
                                ),
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}