import { prisma } from "#/db.ts"
import type { Evidence, Citation, ResearchDocument, SourceReference } from "#/core/research/types.ts"

export interface CitationData {
    id: string
    label: string
    url: string
    title?: string
    domain: string
    publishedAt?: Date
    snippet?: string
    documentId: string
    evidenceId: string
}

export class CitationResolver {
    async resolveCitations(evidence: Evidence[], documents: ResearchDocument[]): Promise<CitationData[]> {
        const citations: CitationData[] = []
        const docMap = new Map(documents.map(d => [d.id, d]))

        for (const ev of evidence) {
            const doc = docMap.get(ev.documentId)
            if (!doc) continue

            const citation: CitationData = {
                id: `cite-${ev.id}`,
                label: this.generateLabel(doc),
                url: doc.canonicalUrl ?? doc.url,
                title: doc.title,
                domain: doc.domain,
                publishedAt: doc.publishedAt,
                snippet: this.generateSnippet(ev.supportingText),
                documentId: doc.id,
                evidenceId: ev.id,
            }

            citations.push(citation)
        }

        return citations
    }

    async persistCitations(jobId: string, citations: CitationData[]): Promise<void> {
        const citationRecords = citations.map(c => ({
            evidenceId: c.evidenceId,
            label: c.label,
            url: c.url,
            title: c.title,
            domain: c.domain,
            publishedAt: c.publishedAt,
            snippet: c.snippet,
        }))

        await prisma.citation.createMany({
            data: citationRecords,
            skipDuplicates: true,
        })
    }

    async getCitationsForEvidence(evidenceIds: string[]): Promise<Citation[]> {
        return prisma.citation.findMany({
            where: {
                evidenceId: { in: evidenceIds },
            },
            orderBy: { createdAt: "asc" },
        })
    }

    async getCitationsForJob(jobId: string): Promise<Citation[]> {
        const evidenceIds = await prisma.evidence.findMany({
            where: { jobId },
            select: { id: true },
        })

        const ids = evidenceIds.map(e => e.id)
        return this.getCitationsForEvidence(ids)
    }

    async getSourceReferences(jobId: string): Promise<SourceReference[]> {
        const sources = await prisma.researchSource.findMany({
            where: { jobId },
            include: {
                documents: {
                    include: {
                        evidence: true,
                    },
                },
            },
        })

        return sources.map(source => {
            const docCount = source.documents.length
            const evCount = source.documents.reduce((sum, d) => sum + d.evidence.length, 0)

            return {
                id: source.id,
                name: source.name,
                domain: source.domain,
                url: source.url,
                category: source.category,
                documentCount: docCount,
                evidenceCount: evCount,
                relevanceScore: source.relevanceScore ?? 0.5,
                authorityScore: source.authorityScore ?? 0.5,
                freshnessScore: source.freshnessScore ?? 0.5,
            }
        })
    }

    private generateLabel(doc: ResearchDocument): string {
        if (doc.title) {
            const shortTitle = doc.title.length > 60 ? doc.title.slice(0, 57) + "..." : doc.title
            return `${shortTitle} (${doc.domain})`
        }
        return doc.domain
    }

    private generateSnippet(text: string, maxLength = 200): string {
        const cleaned = text.replace(/\s+/g, " ").trim()
        if (cleaned.length <= maxLength) return cleaned
        return cleaned.slice(0, maxLength - 3) + "..."
    }

    formatCitationForDisplay(citation: CitationData): string {
        const parts = []
        if (citation.title) parts.push(citation.title)
        parts.push(citation.domain)
        if (citation.publishedAt) {
            parts.push(citation.publishedAt.toISOString().split("T")[0])
        }
        return parts.join(" • ")
    }

    formatCitationInline(citation: CitationData, index: number): string {
        return `[${index}]`
    }

    formatCitationFootnote(citation: CitationData, index: number): string {
        const dateStr = citation.publishedAt ? ` (${citation.publishedAt.toISOString().split("T")[0]})` : ""
        return `[${index}] ${citation.title ?? citation.domain}${dateStr} — ${citation.url}`
    }
}

export function createCitationResolver(): CitationResolver {
    return new CitationResolver()
}