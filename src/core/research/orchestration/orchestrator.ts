import { prisma } from "#/db.ts"
import { createResearchPlanner  } from "./planner.ts"
import type {ResearchPlanner} from "./planner.ts";
import { createSourceSelector  } from "./source-selector.ts"
import type {SourceSelector} from "./source-selector.ts";
import { createDocumentNormalizer  } from "./normalizer.ts"
import type {DocumentNormalizer} from "./normalizer.ts";
import { createEvidenceExtractor  } from "./evidence-extractor.ts"
import type {EvidenceExtractor} from "./evidence-extractor.ts";
import { createResearchSynthesizer  } from "./synthesizer.ts"
import type {ResearchSynthesizer} from "./synthesizer.ts";
import { createCitationResolver  } from "./citation-resolver.ts"
import type {CitationResolver} from "./citation-resolver.ts";
import { createCrawlerService  } from "#/core/crawler/service.ts"
import type {CrawlerService} from "#/core/crawler/service.ts";
import { getSourceRegistry  } from "#/core/research/source-registry.ts"
import type {ResearchSource} from "#/core/research/source-registry.ts";
import type {
    ResearchJob,
    ResearchPlan,
    ResearchSource as ResearchSourceType,
    ResearchDocument,
    Evidence,
    ResearchFinding,
    ResearchReport,
    ResearchQuestion,
    ResearchDepth,
    ResearchStatus,
    DocumentStatus,
    ResearchStage,
} from "#/core/research/types.ts"
import { serverEnv } from "#/env/server.ts"

export interface OrchestratorOptions {
    maxIterations: number
    maxSources: number
    maxPages: number
    crawlConcurrency: number
    extractionConcurrency: number
    onProgress?: (stage: ResearchStage, message: string, progress?: number, data?: Record<string, unknown>) => Promise<void>
}

const DEFAULT_OPTIONS: OrchestratorOptions = {
    maxIterations: 3,
    maxSources: 30,
    maxPages: 100,
    crawlConcurrency: 3,
    extractionConcurrency: 3,
}

export class ResearchOrchestrator {
    private planner: ResearchPlanner
    private sourceSelector: SourceSelector
    private normalizer: DocumentNormalizer
    private evidenceExtractor: EvidenceExtractor
    private synthesizer: ResearchSynthesizer
    private citationResolver: CitationResolver
    private crawler: CrawlerService
    private options: OrchestratorOptions
    private jobId: string

    constructor(jobId: string, options: Partial<OrchestratorOptions> = {}) {
        this.jobId = jobId
        this.options = { ...DEFAULT_OPTIONS, ...options }
        this.planner = createResearchPlanner()
        this.sourceSelector = createSourceSelector({ maxSources: this.options.maxSources })
        this.normalizer = createDocumentNormalizer()
        this.evidenceExtractor = createEvidenceExtractor()
        this.synthesizer = createResearchSynthesizer()
        this.citationResolver = createCitationResolver()
        this.crawler = createCrawlerService()
    }

    async execute(question: ResearchQuestion): Promise<ResearchReport> {
        await this.updateJobStatus("PLANNING", "planning")
        const plan = await this.planner.createPlan(question)
        await this.persistPlan(plan)

        await this.updateJobStatus("DISCOVERING", "discovering")
        const selectedSources = await this.sourceSelector.selectSources(plan)
        await this.persistSources(selectedSources)

        const allDocuments: ResearchDocument[] = []
        const allEvidence: Evidence[] = []

        for (let iteration = 0; iteration < this.options.maxIterations; iteration++) {
            await this.updateJobStatus("CRAWLING", "crawling", undefined, { iteration: iteration + 1 })

            const sourcesToCrawl = iteration === 0 ? selectedSources :
                await this.getSourcesForIteration(plan, allDocuments, allEvidence, iteration)

            if (sourcesToCrawl.length === 0) break

            const documents = await this.crawlSources(sourcesToCrawl)
            await this.persistDocuments(documents)

            const validDocuments = documents.filter(d => this.normalizer.isValid(d))
            if (validDocuments.length === 0) continue

            await this.updateJobStatus("EXTRACTING", "extracting", undefined, { iteration: iteration + 1 })
            const evidence = await this.evidenceExtractor.extractEvidenceBatch(
                validDocuments,
                plan,
                { concurrency: this.options.extractionConcurrency }
            )
            await this.persistEvidence(evidence)

            allDocuments.push(...validDocuments)
            allEvidence.push(...evidence)

            const gapAnalysis = await this.analyzeGaps(plan, allEvidence)
            if (gapAnalysis.missingCategories.length === 0 && gapAnalysis.weakSubQuestions.length === 0) {
                break
            }

            await this.incrementIteration()
        }

        await this.updateJobStatus("SYNTHESIZING", "synthesizing")
        const sourceRefs = await this.citationResolver.getSourceReferences(this.jobId)
        const report = await this.synthesizer.synthesize(plan, allDocuments, allEvidence, sourceRefs)

        const citations = await this.citationResolver.resolveCitations(allEvidence, allDocuments)
        await this.citationResolver.persistCitations(this.jobId, citations)

        await this.persistReport(report)
        await this.updateJobStatus("COMPLETED", "completed")

        return report
    }

    private async crawlSources(sources: ResearchSourceType[]): Promise<ResearchDocument[]> {
        const documents: ResearchDocument[] = []
        const urls = sources.map(s => s.url)

        const crawlResults = await this.crawler.crawlUrls(urls, {
            concurrency: this.options.crawlConcurrency,
            timeoutMs: serverEnv.RESEARCH_CRAWL_TIMEOUT_MS,
            extractLinks: true,
            extractMedia: false,
        })

        for (let i = 0; i < crawlResults.length; i++) {
            const result = crawlResults[i]
            const source = sources[i]

            await prisma.researchSource.update({
                where: { id: source.id },
                data: {
                    crawlStatus: result.success ? "COMPLETED" : "FAILED",
                    crawlError: result.error,
                    crawledAt: new Date(),
                    pagesCrawled: result.success ? 1 : 0,
                },
            })

            if (!result.success) continue

            const doc = this.normalizer.normalize(result, source.id)
            documents.push(doc)
        }

        return documents
    }

    private async analyzeGaps(
        plan: ResearchPlan,
        evidence: Evidence[]
    ): Promise<{ missingCategories: string[]; weakSubQuestions: string[] }> {
        const coveredCategories = new Set<string>()
        const coveredSubQuestions = new Set<string>()

        for (const ev of evidence) {
            if (ev.relevance > 0.6) {
                for (const sq of plan.subQuestions) {
                    if (this.evidenceAddressesSubQuestion(ev, sq)) {
                        coveredSubQuestions.add(sq)
                    }
                }
            }
        }

        const missingCategories = plan.sourceCategories.filter(c => !coveredCategories.has(c))
        const weakSubQuestions = plan.subQuestions.filter(sq => !coveredSubQuestions.has(sq))

        return { missingCategories, weakSubQuestions }
    }

    private evidenceAddressesSubQuestion(evidence: Evidence, subQuestion: string): boolean {
        const sqWords = subQuestion.toLowerCase().split(/\s+/).filter(w => w.length > 3)
        const evText = (evidence.claim + " " + evidence.supportingText).toLowerCase()
        return sqWords.some(w => evText.includes(w))
    }

    private async getSourcesForIteration(
        plan: ResearchPlan,
        documents: ResearchDocument[],
        evidence: Evidence[],
        iteration: number
    ): Promise<ResearchSourceType[]> {
        const gapAnalysis = await this.analyzeGaps(plan, evidence)
        return this.sourceSelector.getSourcesForIteration(
            plan,
            documents.map(d => ({ ...d, selectionReason: "", matchedQueries: [], estimatedRelevance: 0 })),
            gapAnalysis
        )
    }

    private async updateJobStatus(status: ResearchStatus, stage: ResearchStage, progress?: number, data?: Record<string, unknown>): Promise<void> {
        await prisma.researchJob.update({
            where: { id: this.jobId },
            data: {
                status,
                currentStage: stage,
            },
        })

        if (this.options.onProgress) {
            await this.options.onProgress(stage, stage, progress, data)
        }
    }

    private async incrementIteration(): Promise<void> {
        await prisma.researchJob.update({
            where: { id: this.jobId },
            data: {
                iterationsDone: { increment: 1 },
            },
        })
    }

    private async persistPlan(plan: ResearchPlan): Promise<void> {
        await prisma.researchJob.update({
            where: { id: this.jobId },
            data: { plan: plan as any },
        })
    }

    private async persistSources(sources: ResearchSourceType[]): Promise<void> {
        for (const source of sources) {
            await prisma.researchSource.upsert({
                where: { id: source.id },
                update: {
                    jobId: this.jobId,
                    name: source.name,
                    domain: source.domain,
                    url: source.url,
                    category: source.category,
                    priority: source.priority,
                    sourceType: source.sourceType,
                    enabled: source.enabled,
                    crawlPolicy: source.crawlPolicy as any,
                    relevanceScore: source.relevanceScore,
                    authorityScore: source.authorityScore,
                    freshnessScore: source.freshnessScore,
                },
                create: {
                    id: source.id,
                    jobId: this.jobId,
                    name: source.name,
                    domain: source.domain,
                    url: source.url,
                    category: source.category,
                    priority: source.priority,
                    sourceType: source.sourceType,
                    enabled: source.enabled,
                    crawlPolicy: source.crawlPolicy as any,
                    relevanceScore: source.relevanceScore,
                    authorityScore: source.authorityScore,
                    freshnessScore: source.freshnessScore,
                },
            })
        }
    }

    private async persistDocuments(documents: ResearchDocument[]): Promise<void> {
        for (const doc of documents) {
            await prisma.researchDocument.upsert({
                where: { id: doc.id },
                update: {
                    jobId: this.jobId,
                    sourceId: doc.sourceId,
                    url: doc.url,
                    canonicalUrl: doc.canonicalUrl,
                    title: doc.title,
                    description: doc.description,
                    author: doc.author,
                    publishedAt: doc.publishedAt,
                    domain: doc.domain,
                    content: doc.content,
                    markdown: doc.markdown,
                    headings: doc.headings,
                    language: doc.language,
                    wordCount: doc.wordCount,
                    contentHash: doc.contentHash,
                    metadata: doc.metadata as any,
                    status: doc.status,
                    errorMessage: doc.errorMessage,
                },
                create: {
                    id: doc.id,
                    jobId: this.jobId,
                    sourceId: doc.sourceId,
                    url: doc.url,
                    canonicalUrl: doc.canonicalUrl,
                    title: doc.title,
                    description: doc.description,
                    author: doc.author,
                    publishedAt: doc.publishedAt,
                    domain: doc.domain,
                    content: doc.content,
                    markdown: doc.markdown,
                    headings: doc.headings,
                    language: doc.language,
                    wordCount: doc.wordCount,
                    contentHash: doc.contentHash,
                    metadata: doc.metadata as any,
                    status: doc.status,
                    errorMessage: doc.errorMessage,
                },
            })
        }
    }

    private async persistEvidence(evidence: Evidence[]): Promise<void> {
        for (const ev of evidence) {
            await prisma.evidence.upsert({
                where: { id: ev.id },
                update: {
                    jobId: this.jobId,
                    documentId: ev.documentId,
                    claim: ev.claim,
                    supportingText: ev.supportingText,
                    evidenceType: ev.evidenceType,
                    relevance: ev.relevance,
                    confidence: ev.confidence,
                    location: ev.location,
                    startOffset: ev.startOffset,
                    endOffset: ev.endOffset,
                },
                create: {
                    id: ev.id,
                    jobId: this.jobId,
                    documentId: ev.documentId,
                    claim: ev.claim,
                    supportingText: ev.supportingText,
                    evidenceType: ev.evidenceType,
                    relevance: ev.relevance,
                    confidence: ev.confidence,
                    location: ev.location,
                    startOffset: ev.startOffset,
                    endOffset: ev.endOffset,
                },
            })
        }
    }

    private async persistReport(report: ResearchReport): Promise<void> {
        await prisma.researchReport.upsert({
            where: { jobId: this.jobId },
            update: {
                title: report.title,
                executiveSummary: report.executiveSummary,
                keyFindings: report.keyFindings as any,
                detailedAnalysis: report.detailedAnalysis as any,
                disagreements: report.disagreements as any,
                limitations: report.limitations,
                conclusion: report.conclusion,
                sources: report.sources as any,
                wordCount: report.wordCount,
                readingTimeMinutes: report.readingTimeMinutes,
            },
            create: {
                id: report.id,
                jobId: this.jobId,
                title: report.title,
                executiveSummary: report.executiveSummary,
                keyFindings: report.keyFindings as any,
                detailedAnalysis: report.detailedAnalysis as any,
                disagreements: report.disagreements as any,
                limitations: report.limitations,
                conclusion: report.conclusion,
                sources: report.sources as any,
                wordCount: report.wordCount,
                readingTimeMinutes: report.readingTimeMinutes,
            },
        })

        await prisma.researchJob.update({
            where: { id: this.jobId },
            data: {
                status: "COMPLETED",
                completedAt: new Date(),
            },
        })
    }
}

export function createResearchOrchestrator(jobId: string, options?: Partial<OrchestratorOptions>): ResearchOrchestrator {
    return new ResearchOrchestrator(jobId, options)
}