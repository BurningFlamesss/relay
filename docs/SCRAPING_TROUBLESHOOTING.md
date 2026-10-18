# Scraping Troubleshooting Guide

## Quick Diagnosis

Run the diagnostic script to check your scraping infrastructure:

```bash
npx tsx scripts/diagnose-scraping.ts
```

## Common Issues & Solutions

### 1. Crawl4AI Not Running

**Symptoms:**
- All scrapes fail with connection errors
- Health check returns unhealthy

**Solutions:**
```bash
# Start Crawl4AI service
docker compose up -d crawl4ai

# Check if it's running
docker compose ps crawl4ai

# View logs
docker compose logs crawl4ai --tail 100

# Restart if needed
docker compose restart crawl4ai
```

### 2. Crawl4AI Slow/Timeout Issues

**Symptoms:**
- Timeouts during crawling
- Long wait times for results

**Solutions:**
- Increase timeout in `.env.local`:
  ```
  RESEARCH_CRAWL_TIMEOUT_MS=90000
  ```
- Reduce concurrency in `src/core/workers/scraper/index.ts`:
  ```typescript
  concurrency: 10,  // Lower from 20
  ```

### 3. Rate Limiting / IP Blocks

**Symptoms:**
- 403 errors from websites
- "Permanently blocked" errors

**Solutions:**
- The system will auto-retry with backoff
- Use the fallback sources (RSS/API) which still work
- Consider using rotating proxies (requires Crawl4AI config)

### 4. Memory Issues

**Symptoms:**
- Worker crashes
- Docker container OOM killed

**Solutions:**
```bash
# Increase Docker memory for Crawl4AI
# In docker-compose.yml, increase:
#   memory: 4G  ->  6G or 8G

# Reduce batch size
# In src/core/workers/scraper/sources/index.ts:
maxResults: 20  // Lower from 50
```

### 5. Empty Results

**Symptoms:**
- Zero signals found
- Scrapers return empty arrays

**Debug Steps:**
1. Check Crawl4AI health (see above)
2. Test with known good URL:
   ```bash
   curl -X POST http://localhost:11235/crawl \
     -H "Content-Type: application/json" \
     -d '{"urls": ["https://news.ycombinator.com/"]}'
   ```
3. Check worker logs for errors
4. Run diagnostic script

## Architecture

### Fallback Chain

The scraper uses a 3-tier fallback system:

1. **Crawl4AI Search** (fastest, most relevant)
   - Uses Crawl4AI's search endpoint
   - Falls back if unavailable or fails

2. **Direct URL Crawling** (reliable)
   - Builds search URLs for known sources (Reddit, HN, StackOverflow, etc.)
   - Crawls them directly with Crawl4AI

3. **RSS/API Fallback** (always works)
   - Queries RSS feeds directly
   - Uses public APIs (HN Algolia, etc.)
   - No Crawl4AI dependency

### Source Priority

Sources are crawled in this order:
1. **High Priority**: Reddit, Hacker News, G2, Capterra, GitHub Issues
2. **Technical**: Stack Overflow, Dev.to, Hashnode
3. **Market**: LinkedIn, Product Hunt, App Store

## Configuration

### Environment Variables

```env
# Crawl4AI Configuration
CRAWL4AI_URL=http://localhost:11235
CRAWL4AI_API_TOKEN=your_token_here  # Optional

# Scraping Tuning
RESEARCH_CRAWL_TIMEOUT_MS=60000  # 60 seconds per crawl
RESEARCH_MAX_SOURCES=30           # Max sources to scrape
RESEARCH_MAX_PAGES=100            # Max pages to crawl

# Worker Configuration
WORKER_TYPE=orchestrator          # or "all" for workers
```

### Docker Compose

For production, ensure:
- Crawl4AI has at least 4GB RAM
- Shared memory is enabled (`/dev/shm`)
- Health checks are configured

## Monitoring

### Check Worker Status

```bash
# View worker logs
npm run workers

# In another terminal, check Redis queue
redis-cli LLEN "bull:analysis-scraper:wait"
```

### Check Scrape Jobs in Database

```sql
-- Check recent scrape jobs
SELECT id, source, status, signal_count, error_message, created_at
FROM "ScrapeJob"
ORDER BY created_at DESC
LIMIT 20;

-- Check failed jobs
SELECT source, COUNT(*) as failures, error_message
FROM "ScrapeJob"
WHERE status = 'FAILED'
GROUP BY source, error_message;
```

## Performance Tuning

### Optimize for Speed

```typescript
// src/core/workers/scraper/index.ts
{
  concurrency: 30,        // Increase parallel jobs
  limiter: {
    max: 100,             // Increase rate
    duration: 10_000
  }
}
```

### Optimize for Quality

```typescript
// src/core/workers/scraper/processor.ts
const MAX_SIGNALS_PER_SOURCE = 500  // Increase for more signals

// src/core/workers/scraper/sources/index.ts
maxResults: 100  // Fetch more results per query
```

### Optimize for Low Memory

```typescript
// src/core/workers/scraper/index.ts
{
  concurrency: 5,         // Reduce parallel jobs
  limiter: {
    max: 20,              // Lower rate
    duration: 10_000
  }
}
```

## Known Limitations

1. **JavaScript-Heavy Sites**: May need longer `waitFor` times
2. **Authentication Walls**: Some sites block anonymous access
3. **Rate Limits**: Built-in exponential backoff handles most cases
4. **Dynamic Content**: Crawl4AI handles this, but increases load time

## Getting Help

1. Run diagnostic script and save output
2. Check Crawl4AI logs
3. Review worker logs for errors
4. Open an issue with:
   - Diagnostic output
   - Crawl4AI logs
   - Error messages
   - Steps to reproduce
