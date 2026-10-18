# Scraping Fixes Summary

## Issues Identified and Fixed

### 1. Missing `searchAndCrawl` Method (CRITICAL)
**Problem:** The scraper sources were calling `crawler.searchAndCrawl()` which didn't exist in the `CrawlerService`.

**Solution:** Implemented a comprehensive `searchAndCrawl` method with:
- **3-tier fallback system:**
  1. Crawl4AI search endpoint (when available)
  2. Direct URL construction for known sources (Reddit, HN, StackOverflow, etc.)
  3. RSS/API fallback (always works, no Crawl4AI dependency)
- Health checking and auto-detection of Crawl4AI availability
- Robust error handling with graceful degradation

**File:** `src/core/crawler/service.ts`

### 2. Type Issues in API Parsing
**Problem:** Crossref API parsing had type issues with `date-parts` property access.

**Solution:** Added proper type guards and safer property access with fallbacks.

**File:** `src/core/crawler/service.ts` (lines 334-347)

### 3. No Error Recovery in Scrapers
**Problem:** Scrapers would fail completely if any error occurred, with no fallback mechanisms.

**Solution:** Enhanced error handling:
- Wrapped scrape operations in try-catch blocks
- Continue with other queries on partial failures
- Better logging for debugging
- Timeout protection to prevent hanging

**File:** `src/core/workers/scraper/sources/index.ts`

### 4. Poor Quote Extraction
**Problem:** Used raw text without quality filtering, often resulting in poor-quality quotes.

**Solution:** Implemented `extractQualityQuote()` function:
- Prefers markdown content (cleaner)
- Extracts first substantial paragraph
- Minimum 50 character threshold
- Up to 500 characters max

**File:** `src/core/workers/scraper/sources/index.ts`

### 5. Missing Author Extraction
**Problem:** Author information was not being extracted from metadata.

**Solution:** Added `extractAuthor()` function that checks multiple metadata fields:
- `author`
- `author_name`
- `byline`

**File:** `src/core/workers/scraper/sources/index.ts`

### 6. No Timeout Protection
**Problem:** Scrape jobs could hang indefinitely.

**Solution:** Added timeout wrapper in processor:
- 85-second timeout per scrape job
- Race condition with Promise.race()
- Proper error handling for timeouts

**File:** `src/core/workers/scraper/processor.ts`

### 7. Insufficient Logging
**Problem:** Difficult to debug scraping issues without detailed logs.

**Solution:** Added comprehensive logging:
- Per-query logging with signal counts
- Error details for debugging
- Source-level visibility

**File:** `src/core/workers/scraper/sources/index.ts`, `processor.ts`

## New Features Added

### 1. Diagnostic Script
**Purpose:** Quick health check of scraping infrastructure.

**Usage:**
```bash
npm run diagnose
```

**What it tests:**
1. Crawl4AI health check
2. Direct URL crawling
3. Search and crawl functionality
4. RSS feed crawling
5. API crawling

**File:** `scripts/diagnose-scraping.ts`

### 2. Troubleshooting Guide
**Purpose:** Comprehensive documentation for common issues and solutions.

**Topics covered:**
- Crawl4AI not running
- Timeout issues
- Rate limiting
- Memory issues
- Empty results
- Performance tuning

**File:** `docs/SCRAPING_TROUBLESHOOTING.md`

### 3. NPM Script
**Purpose:** Easy access to diagnostic script.

**File:** `package.json` (added `"diagnose": "npx tsx scripts/diagnose-scraping.ts"`)

## Architecture Improvements

### Multi-Source URL Construction
The `buildSourceUrls()` method now constructs direct search URLs for:
- Reddit (2 URLs: modern + old)
- Hacker News (via Algolia)
- Stack Overflow
- Dev.to
- GitHub Issues
- Product Hunt
- G2
- Capterra

### RSS/API Fallback Sources
When Crawl4AI is unavailable, the system falls back to:
- Reddit RSS feeds
- Hacker News RSS (hnrss.org)
- Algolia HN API

### Resilience Features
1. **Health Checking:** Periodic checks of Crawl4AI availability
2. **Graceful Degradation:** Continues with alternative methods on failure
3. **Retry Logic:** Built into Crawl4AI client with exponential backoff
4. **Timeout Protection:** Prevents hanging jobs
5. **Error Isolation:** One query failure doesn't stop others

## Configuration

### Environment Variables
All existing variables are still supported:
```env
CRAWL4AI_URL=http://localhost:11235
CRAWL4AI_API_TOKEN=  # Optional
RESEARCH_CRAWL_TIMEOUT_MS=60000
RESEARCH_MAX_SOURCES=30
RESEARCH_MAX_PAGES=100
```

### Worker Configuration
Default settings in `src/core/workers/scraper/index.ts`:
```typescript
concurrency: 20
limiter: {
  max: 50,
  duration: 10_000
}
```

## Testing Recommendations

### 1. Run Diagnostic
```bash
npm run diagnose
```

### 2. Start Services
```bash
npm run docker:dev  # Starts Postgres, Redis, Crawl4AI
npm run db:generate
npm run db:push
npm run workers     # Start workers in separate terminal
npm run dev         # Start web app
```

### 3. Test Research Flow
- Go to http://localhost:3000
- Create a new research job
- Monitor worker logs for scraping activity
- Check signal count in database

### 4. Verify Fallbacks
- Stop Crawl4AI: `docker compose stop crawl4ai`
- Run research job - should still work via RSS/API
- Restart Crawl4AI: `docker compose start crawl4ai`

## Performance Impact

### Positive
- **Better success rate:** Multi-tier fallback ensures results even when Crawl4AI is down
- **No hanging jobs:** Timeout protection prevents stuck workers
- **More relevant results:** Quality quote extraction improves signal quality

### Considerations
- **Slightly slower:** Fallback mechanisms add overhead, but ensure reliability
- **More logs:** Better debugging but increased log volume
- **Memory:** No significant memory impact

## Breaking Changes
**None.** All changes are backward compatible. The system will:
- Work with or without Crawl4AI
- Use existing environment variables
- Maintain existing API contracts

## Known Limitations

1. **JavaScript-heavy sites:** May need longer `waitFor` times (configurable)
2. **Rate limiting:** Built-in backoff handles most cases, but some sites may still block
3. **Authentication walls:** Sites requiring login won't be crawled
4. **Dynamic content:** Crawl4AI handles this but with increased load time

## Future Improvements

1. **Proxy rotation:** Add support for rotating proxies in Crawl4AI
2. **Caching layer:** Cache crawl results to avoid re-crawling same URLs
3. **Smart throttling:** Adaptive rate limiting based on response codes
4. **Source prioritization:** Dynamic source ranking based on relevance scores
5. **Parallel research jobs:** Allow multiple research jobs to run simultaneously

## Monitoring & Observability

### Logs to Watch
```bash
# Worker logs
npm run workers

# Crawl4AI logs
docker compose logs crawl4ai --tail 100 -f

# Redis queue
redis-cli LLEN "bull:analysis-scraper:wait"
```

### Database Queries
```sql
-- Recent scrape jobs
SELECT source, status, signal_count, created_at
FROM "ScrapeJob"
ORDER BY created_at DESC
LIMIT 20;

-- Failed jobs
SELECT source, error_message, COUNT(*) as count
FROM "ScrapeJob"
WHERE status = 'FAILED'
GROUP BY source, error_message;
```

## Support

If issues persist after these fixes:

1. Run diagnostic script and save output
2. Check Crawl4AI health and logs
3. Review worker logs for errors
4. Check database for failed jobs
5. Open an issue with:
   - Diagnostic output
   - Crawl4AI logs
   - Error messages
   - Steps to reproduce
