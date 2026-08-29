import type { AuthorType } from "#/core/types.ts";

export interface RuleResult {
    confident: boolean;
    authorType: AuthorType;
    intensityScore: number;
    isDemandSignal: boolean;
}

interface SignalInput {
    quote: string;
    title?: string | null;
    authorHandle?: string | null;
    source: string;
}

// AI generated Patterns to detect human desires
const DEMAND_PATTERNS = [
    /i would pay/i, /would pay for/i, /take my money/i,
    /is there a (?:tool|service|product|app|saas)/i,
    /looking for (?:a|an) (?:tool|service|solution)/i,
    /\$\d+\s*(?:per|\/)\s*(?:month|year|mo|yr)/i,
    /willing to pay/i, /budget for this/i, /shut up and take my money/i,
];

const HIGH_INTENSITY = [
    /cost(?:s|ed)?\s+us\s+\$[\d,]+/i, /lost\s+\$[\d,]+/i,
    /wasted?\s+\d+\s+hours?/i, /deal[\- ]breaker/i,
    /switching to/i, /cancelled?\s+(?:our|my)\s+subscription/i,
    /completely broken/i, /unusable/i,
];

const LOW_INTENSITY = [
    /minor annoyance/i, /small issue/i, /not a big deal/i,
    /works for (?:me|us) mostly/i, /minor gripe/i,
];

const SOURCE_AUTHOR_PRIORS: Partial<Record<string, AuthorType>> = {
    LINKEDIN_JOBS: "BUSINESS_OWNER",
    GITHUB_ISSUES: "DEVELOPER",
    STACK_OVERFLOW: "DEVELOPER",
    DEV_TO: "DEVELOPER",
    HASHNODE: "DEVELOPER",
};

const HANDLE_PATTERNS: Array<[RegExp, AuthorType]> = [
    [/\b(?:cto|ceo|founder|co.?founder|vp|director|head.of)\b/i, "BUSINESS_OWNER"],
    [/\b(?:dev|engineer|programmer|coder|hacker|swe)\b/i, "DEVELOPER"],
    [/\b(?:student|intern|grad|undergrad|college)\b/i, "STUDENT"],
];

export function applyRules(signal: SignalInput): RuleResult {
    const text = `${signal.quote} ${signal.title ?? ""} ${signal.authorHandle ?? ""}`.toLowerCase()

    const isDemandSignal = DEMAND_PATTERNS.some((pattern) => pattern.test(text))
    const highIntensity = HIGH_INTENSITY.some((pattern) => pattern.test(text))
    const lowIntensity = LOW_INTENSITY.some((pattern) => pattern.test(text))

    let authorType: AuthorType = SOURCE_AUTHOR_PRIORS[signal.source] ?? "UNKNOWN"

    if (authorType === "UNKNOWN") {
        const handle = signal.authorHandle?.toLowerCase() ?? ""

        for (const [pattern, type] of HANDLE_PATTERNS) {
            if (pattern.test(handle)) {
                authorType = type
                break
            }
        }
    }

    const confident = (highIntensity || lowIntensity) && authorType !== "UNKNOWN"

    return {
        confident,
        authorType,
        intensityScore: highIntensity ? 80 : lowIntensity ? 15 : 40,
        isDemandSignal
    }
}