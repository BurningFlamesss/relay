export async function handleWhyNow(payload: Record<string, unknown>, _job: {
    updateProgress: (value: unknown) => Promise<void>
}): Promise<{
    whyNow: string;
    whyNowEvidence: Array<string>
}> {

    // TODO: Implement AI

    return {
        whyNow: "",
        whyNowEvidence: []
    }
}