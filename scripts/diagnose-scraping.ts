#!/usr/bin/env tsx
/**
 * Diagnostic script to verify scraping infrastructure
 * Run with: npx tsx scripts/diagnose-scraping.ts
 * 
 * Can also run with: npm run diagnose
 * 
 * Usage:
 *   npm run diagnose                  # Use .env.local
 *   CRAWL4AI_URL=http://... npm run diagnose  # Custom URL
 */

import { config } from "dotenv"
import { resolve } from "path"

// Load .env.local if it exists
config({ path: resolve(process.cwd(), ".env.local") })

// Set minimal environment variables for standalone execution (only if not already set)
process.env.CRAWL4AI_URL = process.env.CRAWL4AI_URL || "http://localhost:11235"
process.env.CRAWL4AI_API_TOKEN = process.env.CRAWL4AI_API_TOKEN || ""
process.env.RESEARCH_CRAWL_TIMEOUT_MS = process.env.RESEARCH_CRAWL_TIMEOUT_MS || "60000"
process.env.NODE_ENV = process.env.NODE_ENV || "development"
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/temp"
process.env.BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || "http://localhost:3000"
process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || "temp-diagnostic-key-not-for-production"
process.env.REDIS_CONNECTION_STRING = process.env.REDIS_CONNECTION_STRING || "redis://localhost:6379"
process.env.WORKER_TYPE = process.env.WORKER_TYPE || "diagnostic"
process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ""

async function main() {
    console.log("🔍 Diagnosing Relay Scraping Infrastructure\n")
    console.log("=" .repeat(60))
    console.log(`Crawl4AI URL: ${process.env.CRAWL4AI_URL}`)
    console.log(`Environment: ${process.env.NODE_ENV}`)
    console.log(`Timeout: ${process.env.RESEARCH_CRAWL_TIMEOUT_MS}ms`)
    console.log("=" .repeat(60))
    
    // Import after setting env vars
    const { CrawlerService } = await import("../src/core/crawler/service.ts")
    const crawler = new CrawlerService()
    
    // Test 1: Crawl4AI Health Check
    console.log("\n📋 Test 1: Crawl4AI Health Check")
    console.log("-".repeat(60))
    try {
        const health = await crawler.checkHealth()
        console.log("Status:", health.healthy ? "✅ HEALTHY" : "❌ UNHEALTHY")
        if (health.version) console.log("Version:", health.version)
        if (health.error) console.log("Error:", health.error)
    } catch (error) {
        console.log("Status: ❌ FAILED")
        console.log("Error:", error instanceof Error ? error.message : String(error))
    }
    
    // Test 2: Direct URL Crawl
    console.log("\n📋 Test 2: Direct URL Crawl (Hacker News)")
    console.log("-".repeat(60))
    try {
        const result = await crawler.crawlUrl("https://news.ycombinator.com/", {
            timeoutMs: 15000,
        })
        console.log("Status:", result.success ? "✅ SUCCESS" : "❌ FAILED")
        console.log("Title:", result.title ?? "N/A")
        console.log("Word Count:", result.wordCount ?? 0)
        console.log("Text Preview:", result.text?.slice(0, 200) ?? "N/A")
        if (result.error) console.log("Error:", result.error)
    } catch (error) {
        console.log("Status: ❌ FAILED")
        console.log("Error:", error instanceof Error ? error.message : String(error))
    }
    
    // Test 3: Search and Crawl
    console.log("\n📋 Test 3: Search and Crawl (Query: 'startup ideas')")
    console.log("-".repeat(60))
    try {
        const results = await crawler.searchAndCrawl("startup ideas", {
            maxResults: 5,
            timeoutMs: 30000,
        })
        console.log("Status: ✅ SUCCESS")
        console.log("Results Found:", results.length)
        console.log("\nTop Results:")
        results.slice(0, 3).forEach((r, i) => {
            console.log(`  ${i + 1}. ${r.title ?? "Untitled"}`)
            console.log(`     URL: ${r.url}`)
            console.log(`     Source Type: ${r.metadata?.sourceType ?? "WEB"}`)
        })
    } catch (error) {
        console.log("Status: ❌ FAILED")
        console.log("Error:", error instanceof Error ? error.message : String(error))
    }
    
    // Test 4: RSS Feed Crawl
    console.log("\n📋 Test 4: RSS Feed Crawl (Hacker News RSS)")
    console.log("-".repeat(60))
    try {
        const results = await crawler.crawlRss("https://hnrss.org/frontpage", {
            timeoutMs: 15000,
        })
        console.log("Status:", results.length > 0 ? "✅ SUCCESS" : "⚠️ NO RESULTS")
        console.log("Items Found:", results.length)
        if (results.length > 0) {
            console.log("\nFirst Item:")
            console.log("  Title:", results[0].title ?? "N/A")
            console.log("  URL:", results[0].url)
            console.log("  Published:", results[0].publishedAt ?? "N/A")
        }
    } catch (error) {
        console.log("Status: ❌ FAILED")
        console.log("Error:", error instanceof Error ? error.message : String(error))
    }
    
    // Test 5: API Crawl
    console.log("\n📋 Test 5: API Crawl (HN Algolia API)")
    console.log("-".repeat(60))
    try {
        const results = await crawler.crawlApi(
            "https://hn.algolia.com/api/v1/search",
            {
                timeoutMs: 15000,
                apiParams: { query: "startup", hitsPerPage: "10" }
            }
        )
        console.log("Status:", results.length > 0 ? "✅ SUCCESS" : "⚠️ NO RESULTS")
        console.log("Items Found:", results.length)
        if (results.length > 0) {
            console.log("\nFirst Item:")
            console.log("  Title:", results[0].title ?? "N/A")
            console.log("  URL:", results[0].url)
        }
    } catch (error) {
        console.log("Status: ❌ FAILED")
        console.log("Error:", error instanceof Error ? error.message : String(error))
    }
    
    console.log("\n" + "=".repeat(60))
    console.log("✨ Diagnosis Complete\n")
    
    // Summary and Recommendations
    console.log("📝 Recommendations:")
    console.log("-".repeat(60))
    console.log("1. Ensure Crawl4AI is running: docker compose up -d crawl4ai")
    console.log("2. Check Crawl4AI logs: docker compose logs crawl4ai")
    console.log("3. Verify environment: CRAWL4AI_URL in .env.local")
    console.log("4. If Crawl4AI unavailable, fallback mechanisms will activate")
    console.log("5. Monitor worker logs: npm run workers")
    console.log("")
}

main().catch(console.error)
