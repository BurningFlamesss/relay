export type InspectResult = {
    valid: boolean;
    redeemable: boolean;
    reason?: string;
    redemptionType?: "DIRECT_REDEEM" | "CHECKOUT";
    remainingUses?: number;
    perUserRemaining?: number;
    creditsPreview?: number | null;
    applicablePacks?: Array<{
        id: string;
        name: string;
        creditAmount: number;
        price: number;
        currency: string;
    }>
}