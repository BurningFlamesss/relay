# Relay

Relay is a semi-autonomous research analyst for developers. It analyzes user signals (pain points), clusters recurring problems into structured domains, and surfaces actionable MVP opportunities to build.

![image](https://cdn.hackclub.com/019de946-2a18-75c6-81dd-21b3cab5162f/image.png)

## Relay as a CoFounder (RAAC)

Relay helps you in finding solution to a problem rather than problem to a solution. Whether it's about starting a entirely new startup or finding pain points faced by the users in your existing startup, Relay helps you in finding the real grounded problem rather than a generic one.

## Why prefer Relay over AI like OpenAI, Claude, Gemini?

Relay donot research to find anything generic, add some buzz-words, and try to sell the idea to you adding sugar coated words. Instead Relay helps you find the grounded problem faced by **real humans** as if it wants to start a successful startup and earn in six digits.

## How it works? (SIMPLEX)

1. You Enter a generic Topic
2. Relay scrapes 1000+ posts/articles
3. AI Clusters
4. AI Validates 
5. Gives you a actionable MVP

## How it works? (HALF_DUPLEX)

If there a existing idea and you cares about competition analysis and market research, Relay will work from **STEP 10**

### STEP 1: Initialization:
    User enters generic topic with optional filters
    Frontend sends request to server

### STEP 2: Validation
    Server validates the input checking the rate limits and subscription plan
    Server assigns JobId, stores initial state in postgresql, and triggers a async background job

### STEP 3: Seed Idea
    Server sends the topic, previously failed ideas to AI
    AI returns 3-5 seed ideas

### STEP 4: Parsing
    Server converts AI response into structured scraping task

### STEP 5: Problem Discovery
    Scraping Layer extracts the data
    Streams data into temporary storage

### STEP 6: Preprocessing Layer
    Server Filters irrevelant content, groups by similarity, and extracts repeated complaints

### STEP 7: Problem Validation
    AI identifies recurring patterns, user types, and problem industry
    AI classifies real problem among the noise

### STEP 8: Controlled Iteration
    Server checks max iterations and iterates if necessary in order to get a solid idea to research at

### STEP 9: Store Valid Problem Candidates
    Server stores those which matters

### STEP 10: Analysis Plan
    Server generates scraping plan for analyzing competition

### STEP 11: Competitive Analysis
    Scraper collects existing products, complaints, and gaps

### STEP 12: Preprocessing Layer
    Server extracts competitor lists, common complaints and feature gaps

### STEP 13: AI Analysis
    AI evaluates those results

### STEP 14: Controlled Iteration
    Server checks max iterations and iterates if necessary in order to get a idea with manageable competition

### STEP 15: Store Candidates with Manageable Competition
    Server stores those which matters

### STEP 16: Market Analysis Plan
    Server generates Market analysis plan

### STEP 17: Market Analysis
    Scraper helps to know the market size, problem frequency, audience size by collecting intent driven signals

### STEP 18: Quantitative Estimation Layer
    Server computes problem frequency, trends, market size, audience size

### STEP 19: AI Evaluation and Scoring
    AI process the problem data, competition data and demand metrics to output scoring

### STEP 20: Idea Synthesis
    AI generates Problem statement, solution, MVP, target audience, pricing postulates

### STEP 21: Database
    Server stores full research and marks the job as completed

### STEP 22: Retrieval and Action
    Server fetches the report along with charts, insights, sources
    User can save, reject, publish, or reiterate the idea


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
