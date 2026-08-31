export const modelHandle: unknown = null
export let modelReady = false

let _loadPromise: Promise<void> | null = null

export async function ensureModel(): Promise<void> {
    if (modelReady) {
        return
    }

    if (!_loadPromise) {
        _loadPromise = _load().then(
            () => { modelReady = true },
            (error) => {
                _loadPromise = null;

                throw error
            })
    }

    return _loadPromise
}

export async function _load(): Promise<void> {
    console.log("[MODEL] Loading...")

    // TODO: Initialise inference engine

    console.log("[MODEL] Ready!")
}

export async function warmUp(): Promise<void> {
    await ensureModel().catch((error) => console.error("[MODEL] Warm-up failed: ", error))
}