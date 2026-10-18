# Real-Time Research Progress Tracking

This document describes how the research app reports live progress and how that
progress survives page reloads and navigation.

## Goals

1. Show that the system is actually working (not a static checklist).
2. Show exactly what is being processed, including **which website is being scraped**.
3. Restore the in-progress research automatically after a reload or when the user
   navigates away and comes back.

## Architecture

```
Worker phases ──publishProgress()──▶ Redis pub/sub (job:<id>:progress)
                                            │
                          SSE route /api/research/stream/<jobId>
                                            │
                              useProgressTracker() (browser)
                                            │
                       localStorage  ◀──▶  ProgressTracker.tsx (UI)
```

- **Backend emitters** call `publishProgress(event)` (`src/core/redis.ts`) which
  publishes a JSON `ProgressEvent` to the `job:<id>:progress` channel.
- **SSE route** (`src/routes/api/research/stream/$jobId/route.tsx`) subscribes to
  that channel and forwards the **full** event to the browser, adding a `stage`
  alias (`event.stage ?? event.type`) for backwards compatibility. It also sends
  an initial `SNAPSHOT` event with the job's current stage so a reloaded page
  immediately shows where the job is.
- **Hook** (`src/hooks/useProgressTracker.ts`) parses events, maintains the
  operations log + phase state, reconnects with exponential backoff, and persists
  to `localStorage`.
- **UI** (`src/components/ProgressTracker.tsx`) renders the live view.
- **Page** (`src/routes/research/index.tsx`) stores the active job under
  `relay-active-research` and rehydrates it on mount.

## Progress events

Types live in `src/core/types.ts` (`ProgressEventType`, `ProgressEvent`).

| Event | Meaning |
| --- | --- |
| `PHASE_START` / `PHASE_COMPLETE` / `PHASE_FAILED` | Phase lifecycle (includes `phase`) |
| `SOURCE_DISCOVERED` | A source was discovered (includes `url`, `metadata.domain`) |
| `CRAWL_URL_START` / `CRAWL_URL_DONE` / `CRAWL_URL_FAILED` | Per-website scrape lifecycle (includes `url`, `duration`, `metadata`) |
| `EVIDENCE_EXTRACTED` | Evidence extracted from a document |
| `AI_CALL_START` / `AI_CALL_DONE` | An AI call is in flight (can take a while) |
| `SIGNAL_COUNT_UPDATE` | Cumulative item count |
| `ITERATION_START` / `ITERATION_COMPLETE` | Iteration lifecycle |
| `DONE` / `FATAL` | Terminal states |

`ProgressEvent` fields: `type`, `jobId`, `phase?`, `message`, `timestamp`,
`source?`, `url?`, `duration?`, `signalCount?`, `iterationsDone?`, `error?`,
`metadata?`.

> **Important:** the field is `timestamp` (lowercase `s`). Emitting `timeStamp`
> silently breaks ordering/elapsed-time display — the type system catches it.

### Where events are emitted

| File | Events |
| --- | --- |
| `src/core/workers/research/processor.ts` | `PHASE_START`/`PHASE_COMPLETE`, `DONE`, `FATAL` |
| `src/core/workers/research/phases/planning.ts` | `AI_CALL_START`/`AI_CALL_DONE` |
| `src/core/workers/research/phases/discovery.ts` | `SOURCE_DISCOVERED` |
| `src/core/workers/research/phases/crawling.ts` | `CRAWL_URL_START`/`DONE`/`FAILED` (**the "which website" data**) |
| `src/core/workers/research/phases/extraction.ts` | `EVIDENCE_EXTRACTED` |
| `src/core/workers/research/phases/analysis.ts` | `AI_CALL_START`/`AI_CALL_DONE` |
| `src/core/workers/research/phases/synthesis.ts` | `AI_CALL_START`/`AI_CALL_DONE` |
| `src/core/workers/scraper/*` | Analysis-flow `SCRAPE_SOURCE_*` / `CRAWL_URL_*` |

## Hook API

```typescript
const progress = useProgressTracker(jobId, {
  // SSE endpoint; defaults to `/api/stream/${jobId}` (analysis).
  // For research pass `/api/research/stream/${jobId}`.
  streamUrl,
  onComplete: () => {},
  onError: (err) => {},
  maxOperations: 200, // default
  persist: true,      // default; uses localStorage
})

// progress: operations, phases, currentPhase, signalCount, iteration,
//           isComplete, hasError, startedAt, lastEventAt, connected, clearProgress
```

## Persistence

| Key | Storage | Purpose |
| --- | --- | --- |
| `relay-active-research` | `localStorage` | The currently shown research job (`jobId`, `question`, `stage`) |
| `relay-progress-<jobId>` | `localStorage` | Operation log + phase state for that job |

On mount the research page:

1. Loads history.
2. Reads `relay-active-research`. If the job still exists:
   - **active** → restore it, switch to the Progress tab, reconnect SSE.
   - **completed** → load and show the finished report.
   - **failed/cancelled** → show the error.
3. Clears the pointer only if the job no longer exists (or on cancel).

`localStorage` (rather than `sessionStorage`) is used so the research survives a
full reload, opening a new tab, and navigating away and back.

## UI features

- **Live badge** — green pulsing "Live" when SSE is connected, amber
  "Reconnecting…" otherwise.
- **Last activity** — "Last activity Ns ago", updated every second so the view
  visibly keeps ticking even between events.
- **Phase bar + phase list** — research phases when a `RESEARCH_*` phase is seen,
  analysis phases otherwise.
- **Currently Processing** — URLs whose `CRAWL_URL_START` has no matching
  `DONE`/`FAILED` yet.
- **Websites Scraped** — distinct hosts successfully crawled.
- **Activity Log** — timestamped operations with source icons, clickable URLs,
  durations, counts, and errors.

## AI model configuration (common breakage source)

Research planning requires an AI model with **structured output**. The model
chains live in `src/core/ai/types.ts` (`MODEL_ROLES`, `MODEL_CAPABILITIES`).

OpenRouter free models change frequently. If research jobs fail immediately with
`All models failed for role planner`, the configured models are likely
deprecated/paid/blocked. To refresh:

1. List current free models:
   ```bash
   curl -s https://openrouter.ai/api/v1/models | grep -o '"id":"[^"]*:free"'
   ```
2. Verify a candidate supports JSON + tools:
   ```bash
   curl -s https://openrouter.ai/api/v1/chat/completions \
     -H "Authorization: Bearer $OPENROUTER_API_KEY" -H "Content-Type: application/json" \
     -d '{"model":"<slug>","messages":[{"role":"user","content":"JSON only {\"ok\":true}"}],"response_format":{"type":"json_object"}}'
   ```
3. Update `MODEL_ROLES`/`MODEL_CAPABILITIES` with working slugs.

The router skips models whose capabilities don't satisfy the request (e.g. a
`json_object` request skips models without `structuredOutput`), so every role
needs at least one working, structured-output-capable model.

### Free-tier daily quota

OpenRouter's free models share a **per-day request limit** (50/day per key for
free-tier accounts). A single research job makes roughly
`1 (planning) + N (one per extracted document) + 1 (analysis) + 1 (synthesis)`
requests, so the per-document extraction cap
(`RESEARCH_MAX_EXTRACTION_DOCS`, default `30`) is the main lever that keeps a job
inside the budget. Raise it (e.g. `60`) once paid credit is available.

**Key rotation.** Configure more than one key and the provider automatically
retires a key when it returns `free-models-per-day` and retries the request with
the next one:

```bash
# .env.local
OPENROUTER_API_KEY=sk-or-v1-primary
# Comma-separated; rotated in order when a key's daily quota is exhausted
OPENROUTER_API_KEYS=sk-or-v1-second,sk-or-v1-third
```

`src/core/ai/provider.ts` builds the pool (de-duplicated, `OPENROUTER_API_KEYS`
first, then `OPENROUTER_API_KEY`), round-robins across keys, skips exhausted ones
for the rest of the process lifetime, and only fails with `QUOTA_EXCEEDED` when
**all** keys are spent. Inspect a key's remaining free requests with:

```bash
curl -s -H "Authorization: Bearer $OPENROUTER_API_KEY" https://openrouter.ai/api/v1/key
# -> "free_model_daily_requests": { "used": 51, "limit": 50, "remaining": 0 }
```

To raise the limit instead, add credit to the account ($10 unlocks ~1000 free
requests/day), or point a role at a paid model without touching code:

```bash
# .env.local
OPENROUTER_MODEL_PLANNER=openai/gpt-4o-mini
OPENROUTER_MODEL_SYNTHESIZER=openai/gpt-4o-mini
```

Each `OPENROUTER_MODEL_<ROLE>` value is tried first for that role.

## Verification

```bash
npm run verify:research        # enqueue a job and watch it progress to completion
npm run diagnose               # check scraping infrastructure
```
