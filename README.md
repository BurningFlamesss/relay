# Relay

Relay is a semi-autonomous research analyst for developers. It analyzes user signals (pain points), clusters recurring problems into structured domains, and surfaces actionable MVP opportunities to build.

![image](https://cdn.hackclub.com/019de946-2a18-75c6-81dd-21b3cab5162f/image.png)

## Relay as a CoFounder (RAAC)

Relay helps you in finding solution to a problem rather than problem to a solution. Whether it's about starting a entirely new startup or finding pain points faced by the users in your existing startup, Relay helps you in finding the real grounded problem rather than a generic one.

## Why prefer Relay over AI like OpenAI, Claude, Gemini?

Relay donot research to find anything generic, add some buzz-words, and try to sell the idea to you adding sugar coated words. Instead Relay helps you find the grounded problem faced by **real humans** as if it wants to start a successful startup and earn in six digits.

## How it works?

1. You Enter a generic Topic
2. Relay scrapes 1000+ posts/articles
3. AI Clusters
4. AI Validates 
5. Gives you a actionable MVP

## Workflow

### Phase 0 PreFlight

Before delegating the flow to the workers of bullmq. System will:

- Vectorically match any identical or near-identical topic (within a time frame). If found, offer that result at 5 credits. 
- Estimate cost and show to the user so that they can confirm the research.

### Phase 1 Query Architecture

System generates targetted search queries from the topic. Queries will have intent labels like:

- Complaint
- Workaround
- Demand signal
- Competitor
- Failure signal
- Feature request

### Phase 2 Parallel Signal Scraping

Based on the search queries, all the sources are scraped simultaneously (parallely) as children of Bullmq jobs:

- Priority 1 (High Signal Density from reddit, hn, capterra, trustpilot)
- Priority 2 (Technical Signal from github/github issues, stackoverflow, dev posts)
- Priority 3 (Market Signal from linkedin, product hunt, googleplay/app store reviews)

These scrapers sends signals to redis. In a structure which somewhat includes quote, url, source, authorType, date, and sentimentIntensity

### Phase 3 Signal Preprocessing

Filters irrelevant content by:

- Deduplications of urls, content hash
- Author classification
- Intensity extraction
- Demand tags

### Phase 4 Problem cluster synthesis

AI gets clusters of real data grouped via semantics similarity. Then, it outputs the following per clusters:

- Problem statement
- Frequency
- Intensity
- Who is affected
- Failed alternatives people mentioned
- Evidence (sources)
- Demand

### Phase 5 Iteration Gate

Scores every cluster. If top cluster score is below threshold (also, credits are taken into account) then:

- Generates deeper and more targetted queries scoped to the top cluster (Phase 1)
- Rescrape with those queries (Phase 2)
- Merge new signals into existing clusters (Phase 3)
- Reevaluates (Phase 4)

until atleast three cluster is found above threshold. 

### Phase 6 Opportunity Analysis

For top clusters, it scrapes the data for identifying:

- Willingness to pay
- Distribution Channel Identification
- Timing Signal
- Why now answer

### Phase 7 Competitive Analysis

For top clusters, it scrapes the data related to:

- Existing solutions
- their most common complaints
- features people keep requesting
- price point
- dead competitors (and extract why)

If many people tried and failed, that might be a warning sign. If they failed for a reason that can be avoided, that becomes an opportunity.

Parallely runs 6 and 7 phase

### Phase 8 Market Size

Scraper scrapes the data for estimating:

- Community size
- Search Volume
- Fundings

### Phase 9 Scoring

Server then composite scores:

- Problem Score
- Competition Score
- Market Score
- Timing Score

Final score would be 2x2 matrix of Problem Strength vs Competition Difficulty.

### Phase 10 Synthesis

AI generates the final report from the evidences. It synthesised the depiction of data:

- Problem Statement
- Target Persona
- Solution Postulate
- MVP Score
- Differentiation angle
- Goto Market Channel
- Risk factors
- Confidence Score

### Phase 11 Assembly

Shows the report to the user. The report would contain:

- Evidence
- Signal graph
- Competitors
- Score breakdown
- Raw signals (authenticity)

### Phase 12 Action

USer can approve, hold, discard with feedback.
User can rerun from phase 5 onwards with constraints.
If the idea is discarded, it enters moderation queue before any reuse.


## Tools & Tech Stack

1. Tanstack Start
2. Hono
3. Postgresql
4. Redis
5. Pgvector
6. SSE (instead of ws)
7. Shadcn
8. Tailwind CSS
9. Better Auth
10. Prisma

*Still deciding...
