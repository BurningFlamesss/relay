import { generateContentHash, generateUrlHash, extractDomain, normalizeUrl } from "#/core/research/source-registry.ts"
import type { ResearchDocument, CrawlResult } from "#/core/research/types.ts"
import type { CrawlResult as CrawlerCrawlResult } from "#/core/crawler/service.ts"

export interface NormalizationOptions {
    minWordCount: number
    maxWordCount: number
    removeNavigation: boolean
    removeAds: boolean
    removeCookieBanners: boolean
    preserveHeadings: boolean
    preserveLinks: boolean
    preserveTables: boolean
}

const DEFAULT_OPTIONS: NormalizationOptions = {
    minWordCount: 100,
    maxWordCount: 50000,
    removeNavigation: true,
    removeAds: true,
    removeCookieBanners: true,
    preserveHeadings: true,
    preserveLinks: true,
    preserveTables: true,
}

const BOILERPLATE_SELECTORS = [
    "nav", "header", "footer", "aside",
    "[role='navigation']", "[role='banner']", "[role='contentinfo']",
    ".navigation", ".nav", ".menu", ".sidebar", ".header", ".footer",
    ".cookie", ".banner", ".popup", ".modal", ".overlay",
    ".advertisement", ".ads", ".ad-slot", ".sponsor",
    ".share", ".social", ".newsletter", ".subscribe",
    ".comment", ".comments", "#comments",
    ".related", ".recommended", ".popular",
    "script", "style", "noscript", "iframe",
]

export class DocumentNormalizer {
    private options: NormalizationOptions

    constructor(options: Partial<NormalizationOptions> = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options }
    }

    normalize(crawlResult: CrawlerCrawlResult, sourceId?: string): ResearchDocument {
        const url = normalizeUrl(crawlResult.url)
        const domain = extractDomain(url)
        const contentHash = generateContentHash(crawlResult.markdown ?? crawlResult.text ?? crawlResult.html ?? "")
        const urlHash = generateUrlHash(url)

        const content = this.extractMainContent(crawlResult)
        const wordCount = this.countWords(content)

        const headings = this.extractHeadings(crawlResult)

        return {
            id: urlHash,
            url,
            canonicalUrl: this.extractCanonicalUrl(crawlResult),
            title: this.cleanTitle(crawlResult.title),
            description: this.cleanDescription(crawlResult.description),
            author: crawlResult.author,
            publishedAt: crawlResult.publishedAt ? new Date(crawlResult.publishedAt) : undefined,
            crawledAt: new Date(),
            sourceId,
            domain,
            content,
            markdown: crawlResult.markdown,
            headings,
            language: crawlResult.language,
            wordCount,
            contentHash,
            metadata: {
                originalUrl: crawlResult.url,
                statusCode: crawlResult.statusCode,
                headingsCount: headings.length,
                linksCount: crawlResult.links?.length ?? 0,
                mediaCount: crawlResult.media?.length ?? 0,
                crawlDuration: crawlResult.metadata?.crawlDuration,
            },
            status: "COMPLETED",
        }
    }

    private extractMainContent(crawlResult: CrawlerCrawlResult): string {
        let content = crawlResult.markdown ?? crawlResult.text ?? ""

        if (!content && crawlResult.html) {
            content = this.htmlToText(crawlResult.html)
        }

        content = this.removeBoilerplate(content)
        content = this.cleanWhitespace(content)
        content = this.truncateContent(content)

        return content
    }

    private htmlToText(html: string): string {
        return html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
            .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&/g, "&")
            .replace(/</g, "<")
            .replace(/>/g, ">")
            .replace(/"/g, '"')
            .replace(/'/g, "'")
            .replace(/\s+/g, " ")
            .trim()
    }

    private removeBoilerplate(content: string): string {
        const lines = content.split("\n")
        const filtered = lines.filter(line => {
            const trimmed = line.trim().toLowerCase()
            if (trimmed.length < 10) return true

            const boilerplatePatterns = [
                /cookie/i,
                /accept all/i,
                /privacy policy/i,
                /terms of service/i,
                /subscribe/i,
                /newsletter/i,
                /follow us/i,
                /share this/i,
                /advertisement/i,
                /sponsored/i,
                /related articles/i,
                /read more/i,
                /load more/i,
            ]

            return !boilerplatePatterns.some(p => p.test(trimmed))
        })

        return filtered.join("\n")
    }

    private cleanWhitespace(content: string): string {
        return content
            .replace(/\n{3,}/g, "\n\n")
            .replace(/ {2,}/g, " ")
            .replace(/\t/g, " ")
            .trim()
    }

    private truncateContent(content: string): string {
        const words = content.split(/\s+/)
        if (words.length > this.options.maxWordCount) {
            return words.slice(0, this.options.maxWordCount).join(" ") + "... [truncated]"
        }
        return content
    }

    private extractHeadings(crawlResult: CrawlerCrawlResult): string[] {
        if (!this.options.preserveHeadings) return []

        if (crawlResult.headings && crawlResult.headings.length > 0) {
            return crawlResult.headings.map(h => `${"#".repeat(h.level)} ${h.text}`).slice(0, 50)
        }

        if (crawlResult.markdown) {
            const headingMatches = crawlResult.markdown.match(/^#{1,6}\s+.+$/gm)
            return headingMatches?.slice(0, 50) ?? []
        }

        return []
    }

    private extractCanonicalUrl(crawlResult: CrawlerCrawlResult): string | undefined {
        if (crawlResult.metadata?.canonicalUrl) {
            return crawlResult.metadata.canonicalUrl as string
        }
        if (crawlResult.metadata?.ogUrl) {
            return crawlResult.metadata.ogUrl as string
        }
        return undefined
    }

    private cleanTitle(title?: string): string | undefined {
        if (!title) return undefined
        return title
            .replace(/\s*[|\-–—]\s*.*$/, "")
            .replace(/\s+/g, " ")
            .trim()
    }

    private cleanDescription(description?: string): string | undefined {
        if (!description) return undefined
        return description
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 500)
    }

    private countWords(text: string): number {
        return text.split(/\s+/).filter(w => w.length > 0).length
    }

    isValid(document: ResearchDocument): boolean {
        if (document.wordCount < this.options.minWordCount) {
            return false
        }
        if (document.wordCount > this.options.maxWordCount) {
            return false
        }
        if (!document.content || document.content.trim().length < 200) {
            return false
        }
        return true
    }

    getContentPreview(document: ResearchDocument, maxLength = 500): string {
        return document.content.slice(0, maxLength)
    }
}

export function createDocumentNormalizer(options?: Partial<NormalizationOptions>): DocumentNormalizer {
    return new DocumentNormalizer(options)
}