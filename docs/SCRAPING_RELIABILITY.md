# Scraping Reliability

Research jobs failed at the final `synthesis` step with **"Insufficient data for
synthesis"**. This document records the root cause and the fixes.

## Symptom

- Planning/discovery/crawling/extraction phases all ran to completion.
- Dozens of `ResearchDocument` rows were stored, but **0 `Evidence` rows** were
  created → synthesis bails out at its `!job.evidence.length` guard.

## Root cause

The evidence extractor is *not* broken — it correctly returns no evidence when a
document is topically irrelevant. The real problem was **what we crawled**:

1. **Discovery registers sources by their base URL** (e.g. `https://dev.to`,
   `https://github.com`, `https://reddit.com`).
2. **`runResearchCrawling` crawled those base URLs directly**, so it fetched
   homepages / latest feeds regardless of the research question.
3. **API sources used the wrong query**: `apiParams.query` was set to
   `source.name` (the source's *name*, e.g. `"ArXiv"`) instead of the research
   question, so academic APIs returned `400`/HTML.

Result: the documents were about unrelated topics (e.g. a RabbitMQ article for a
"Jira UI complaints" research), so the extractor found nothing relevant.

A secondary bug made this worse: `ResearchDocument` was upserted on a **globally
unique `contentHash`** whose `update` block re-assigned `jobId`. When a second
job crawled the same URLs it *stole* the first job's documents mid-flight.

## Fixes

### 1. Query-aware crawl targets — `src/core/research/source-search.ts`

`resolveSourceCrawlTarget(source, query)` maps a source (by domain) to a
topic-scoped target. Crawling a *search page* is unreliable (the UIs are
JavaScript-heavy and return no extractable text), so community/code sources are
routed to their **public JSON APIs** instead:

| Source | Target |
| --- | --- |
| Reddit (reddit.com, teddit…) | `reddit.com/search.rss?q=…` (Atom; the JSON API blocks bots with 403) |
| Hacker News | `hn.algolia.com/api/v1/search?query=…&tags=(story,comment)` |
| Stack Overflow | `api.stackexchange.com/2.3/search/advanced?q=…&filter=withbody` |
| GitHub | `api.github.com/search/issues?q=…` |
| DEV.to | `dev.to/feed/tag/<tag>` (tag derived from the query) |
| arXiv | `export.arxiv.org/api/query?search_query=all:…` (Atom) |
| OpenAlex / Crossref / Semantic Scholar | existing academic JSON APIs |
| Medium / G2 / Capterra / Product Hunt / Lobsters | best-effort topic search URL |

Unknown domains fall back to their original URL. Because most search APIs are
keyword-based, the natural-language question is first reduced to salient keywords
(`keywordQuery`), e.g. *"What are the most common complaints about GitHub
Actions?"* → `github actions`. Intent words ("complaints", "problems", …) are
dropped so they don't over-constrain the search — the extractor still filters for
complaints.

`runResearchCrawling`
(`src/core/workers/research/phases/crawling.ts`) loads the job's plan, derives the
query (`plan.question`), and crawls the resolved target. The `CRAWL_URL_START`
progress events now show the actual query and target URL, so the UI displays
*what* is being scraped, not just the source name.

Crawler changes in `src/core/crawler/service.ts`:

- `parseApiResponse` now understands HN Algolia, Stack Exchange and GitHub
  responses (in addition to Crossref/OpenAlex/Semantic Scholar).
- RSS/API requests send a browser-like `User-Agent` (bot agents are rejected by
  several public endpoints) and the Atom content type.
- `normalizer.ts` strips HTML tags from RSS/API payloads before extraction.

Extraction (`src/core/workers/research/phases/extraction.ts`) now loads the plan
once (instead of re-querying it per document) and caps a job at 60 documents
(`MAX_EXTRACTION_DOCS`), so large crawls finish in a reasonable time.

### 2. Job-scoped document hashes

`contentHash` now includes `jobId`, so documents can never move between jobs:

```ts
const contentHash = createHash("sha256")
  .update(content + result.url + jobId)
  .digest("hex")
  .slice(0, 32)
```

**Follow-up bug (fixed):** the extraction phase then *overwrote* that hash with the
normalizer's non-scoped hash (`sha256(content + url)`), which collided across jobs
and crashed extraction with a Prisma unique-constraint error on
`research_document_contentHash_key`. Extraction now leaves the crawl-time hash
untouched and reuses the job-scoped DB row id (`normalized.id = doc.id`) so
evidence rows are scoped to the job too:

```ts
// extraction.ts - do NOT write contentHash here
normalized.id = doc.id
await prisma.researchDocument.update({
  where: { id: doc.id },
  data: { content, markdown, headings, wordCount, metadata, status: "COMPLETED" },
})
```

### 3. Malformed model JSON falls through to the next model

`nemotron-3-ultra` occasionally returns a *200* with malformed JSON (e.g.
`{"summary":"{"summary":"ok"}`). The router previously trusted any 200, so the
planner/synthesizer silently degraded to their heuristic fallbacks. Now
`ModelRouter.complete` validates `json_object` responses with `extractJsonObject`
(tolerating code fences and surrounding prose); an unparseable response throws a
retryable error so the **next model in the chain is tried**. `nemotron-super`
(which returns valid JSON) is additionally listed first in every role chain.

### 4. Extraction spends its budget on content-rich documents

Extraction is capped (`RESEARCH_MAX_EXTRACTION_DOCS`, default `30`) because each
document costs one LLM request. The query used to take the `crawledAt`-oldest
documents, which were often near-empty entries (`openalex`/`reddit` = 0 words,
Hacker News ≈ 53 words) - so the cap was wasted and few evidence items were
produced. It now orders by `wordCount desc`, scans a wider candidate set
(`MAX × 3`), and only counts *valid* documents against the cap. Junk documents
are still marked `FAILED` ("too short or empty") without spending a request.

### 5. Prompts include the exact JSON shape

The evidence-extractor and synthesizer prompts said "JSON matching the schema"
but never showed the field names, so models omitted keys (`supportingText`,
`executiveSummary`, `keyFindings`, …) and failed zod validation → heuristic
fallbacks. Both prompts now embed the literal JSON skeleton (with
`evidenceType` / `confidence` enums). `formatEvidence` also shows each item's
real `[evidence-id]` instead of an array index, so the synthesizer can cite
actual evidence rows.

## Related: AI model configuration

The free OpenRouter models used for planning were retired/blocked
(`minimax/minimax-m3:free` → paid, `thinkingmachines/inkling:free` → agentic-only),
which made **every** job fail at planning. See the "AI model configuration"
section of `docs/PROGRESS_TRACKING.md` for how to refresh `MODEL_ROLES` /
`MODEL_CAPABILITIES` in `src/core/ai/types.ts`.

## Verification

```bash
npm run verify:research -- "your research question"
```

This enqueues a job and prints each status/stage transition plus final
source/document/evidence/finding counts. A healthy run reaches `COMPLETED` with
`evidence > 0`.

A quick way to confirm topical relevance is to inspect the stored documents:

```bash
docker exec relay-postgres-1 psql -U relay -d relay \
  -c "SELECT left(url,80), status, \"wordCount\" FROM research_document WHERE \"jobId\"='<jobId>';"
```
