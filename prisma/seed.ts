import { serverEnv } from '#/env/server.js';
import { PrismaClient } from '../src/generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { createHash } from 'node:crypto'

const adapter = new PrismaPg({
  connectionString: serverEnv.DATABASE_URL,
})

const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Seeding database...')

  // Create a global seed user
  const seedUser = await prisma.user.upsert({
    where: { id: "seed-user" },
    update: {},
    create: {
      id: "seed-user",
      name: "Seed User",
      email: "seed@relay.local",
      emailVerified: true,
    },
  })

  // Create a global seed research job
  const seedJob = await prisma.researchJob.upsert({
    where: { id: "seed-global" },
    update: {},
    create: {
      id: "seed-global",
      userId: seedUser.id,
      question: "Global seed sources",
      questionHash: "seed-global-hash",
      depth: "STANDARD",
      status: "COMPLETED",
    },
  })

  const defaultSources = [
    {
      name: "ArXiv",
      domain: "arxiv.org",
      url: "https://arxiv.org",
      category: "ACADEMIC" as const,
      priority: 10,
      crawlPolicy: { maxDepth: 2, maxPages: 50, allowedPaths: ["/abs/", "/pdf/"] },
    },
    {
      name: "Google Scholar",
      domain: "scholar.google.com",
      url: "https://scholar.google.com",
      category: "ACADEMIC" as const,
      priority: 9,
      crawlPolicy: { maxDepth: 1, maxPages: 20 },
    },
    {
      name: "Semantic Scholar",
      domain: "semanticscholar.org",
      url: "https://www.semanticscholar.org",
      category: "ACADEMIC" as const,
      priority: 9,
      crawlPolicy: { maxDepth: 2, maxPages: 50 },
    },
    {
      name: "PubMed",
      domain: "pubmed.ncbi.nlm.nih.gov",
      url: "https://pubmed.ncbi.nlm.nih.gov",
      category: "ACADEMIC" as const,
      priority: 9,
      crawlPolicy: { maxDepth: 2, maxPages: 50 },
    },
    {
      name: "IEEE Xplore",
      domain: "ieeexplore.ieee.org",
      url: "https://ieeexplore.ieee.org",
      category: "ACADEMIC" as const,
      priority: 8,
      crawlPolicy: { maxDepth: 2, maxPages: 30 },
    },
    {
      name: "ACM Digital Library",
      domain: "dl.acm.org",
      url: "https://dl.acm.org",
      category: "ACADEMIC" as const,
      priority: 8,
      crawlPolicy: { maxDepth: 2, maxPages: 30 },
    },
    {
      name: "Nature",
      domain: "nature.com",
      url: "https://www.nature.com",
      category: "ACADEMIC" as const,
      priority: 8,
      crawlPolicy: { maxDepth: 2, maxPages: 30 },
    },
    {
      name: "Science",
      domain: "science.org",
      url: "https://www.science.org",
      category: "ACADEMIC" as const,
      priority: 8,
      crawlPolicy: { maxDepth: 2, maxPages: 30 },
    },
    {
      name: "Wikipedia",
      domain: "wikipedia.org",
      url: "https://en.wikipedia.org",
      category: "RESEARCH" as const,
      priority: 7,
      crawlPolicy: { maxDepth: 2, maxPages: 100 },
    },
    {
      name: "GitHub",
      domain: "github.com",
      url: "https://github.com",
      category: "TECHNICAL" as const,
      priority: 9,
      crawlPolicy: { maxDepth: 2, maxPages: 50, allowedPaths: ["/README", "/docs/", "/wiki/"] },
    },
    {
      name: "GitLab",
      domain: "gitlab.com",
      url: "https://gitlab.com",
      category: "TECHNICAL" as const,
      priority: 7,
      crawlPolicy: { maxDepth: 2, maxPages: 30 },
    },
    {
      name: "Stack Overflow",
      domain: "stackoverflow.com",
      url: "https://stackoverflow.com",
      category: "TECHNICAL" as const,
      priority: 8,
      crawlPolicy: { maxDepth: 2, maxPages: 50 },
    },
    {
      name: "MDN Web Docs",
      domain: "developer.mozilla.org",
      url: "https://developer.mozilla.org",
      category: "DOCUMENTATION" as const,
      priority: 10,
      crawlPolicy: { maxDepth: 3, maxPages: 100 },
    },
    {
      name: "AWS Documentation",
      domain: "docs.aws.amazon.com",
      url: "https://docs.aws.amazon.com",
      category: "DOCUMENTATION" as const,
      priority: 9,
      crawlPolicy: { maxDepth: 3, maxPages: 100 },
    },
    {
      name: "Google Cloud Documentation",
      domain: "cloud.google.com",
      url: "https://cloud.google.com/docs",
      category: "DOCUMENTATION" as const,
      priority: 9,
      crawlPolicy: { maxDepth: 3, maxPages: 100 },
    },
    {
      name: "Microsoft Learn",
      domain: "learn.microsoft.com",
      url: "https://learn.microsoft.com",
      category: "DOCUMENTATION" as const,
      priority: 9,
      crawlPolicy: { maxDepth: 3, maxPages: 100 },
    },
    {
      name: "Hugging Face",
      domain: "huggingface.co",
      url: "https://huggingface.co",
      category: "TECHNICAL" as const,
      priority: 9,
      crawlPolicy: { maxDepth: 2, maxPages: 50, allowedPaths: ["/papers/", "/blog/", "/docs/"] },
    },
    {
      name: "Papers with Code",
      domain: "paperswithcode.com",
      url: "https://paperswithcode.com",
      category: "RESEARCH" as const,
      priority: 9,
      crawlPolicy: { maxDepth: 2, maxPages: 50 },
    },
    {
      name: "Distill.pub",
      domain: "distill.pub",
      url: "https://distill.pub",
      category: "RESEARCH" as const,
      priority: 8,
      crawlPolicy: { maxDepth: 2, maxPages: 30 },
    },
    {
      name: "OpenAI Blog",
      domain: "openai.com",
      url: "https://openai.com/blog",
      category: "COMPANY" as const,
      priority: 8,
      crawlPolicy: { maxDepth: 2, maxPages: 30 },
    },
    {
      name: "Anthropic Blog",
      domain: "anthropic.com",
      url: "https://www.anthropic.com/news",
      category: "COMPANY" as const,
      priority: 8,
      crawlPolicy: { maxDepth: 2, maxPages: 30 },
    },
    {
      name: "Google AI Blog",
      domain: "ai.googleblog.com",
      url: "https://ai.googleblog.com",
      category: "COMPANY" as const,
      priority: 8,
      crawlPolicy: { maxDepth: 2, maxPages: 30 },
    },
    {
      name: "Meta AI Blog",
      domain: "ai.meta.com",
      url: "https://ai.meta.com/blog",
      category: "COMPANY" as const,
      priority: 7,
      crawlPolicy: { maxDepth: 2, maxPages: 30 },
    },
    {
      name: "NVIDIA Blog",
      domain: "blogs.nvidia.com",
      url: "https://blogs.nvidia.com",
      category: "COMPANY" as const,
      priority: 7,
      crawlPolicy: { maxDepth: 2, maxPages: 30 },
    },
    {
      name: "TechCrunch",
      domain: "techcrunch.com",
      url: "https://techcrunch.com",
      category: "NEWS" as const,
      priority: 6,
      crawlPolicy: { maxDepth: 2, maxPages: 50 },
    },
    {
      name: "The Verge",
      domain: "theverge.com",
      url: "https://www.theverge.com",
      category: "NEWS" as const,
      priority: 6,
      crawlPolicy: { maxDepth: 2, maxPages: 50 },
    },
    {
      name: "VentureBeat",
      domain: "venturebeat.com",
      url: "https://venturebeat.com",
      category: "NEWS" as const,
      priority: 6,
      crawlPolicy: { maxDepth: 2, maxPages: 50 },
    },
    {
      name: "Hacker News",
      domain: "news.ycombinator.com",
      url: "https://news.ycombinator.com",
      category: "COMMUNITY" as const,
      priority: 7,
      crawlPolicy: { maxDepth: 1, maxPages: 30 },
    },
    {
      name: "Reddit - MachineLearning",
      domain: "reddit.com",
      url: "https://www.reddit.com/r/MachineLearning",
      category: "COMMUNITY" as const,
      priority: 7,
      crawlPolicy: { maxDepth: 1, maxPages: 30 },
    },
    {
      name: "Reddit - LocalLLaMA",
      domain: "reddit.com",
      url: "https://www.reddit.com/r/LocalLLaMA",
      category: "COMMUNITY" as const,
      priority: 7,
      crawlPolicy: { maxDepth: 1, maxPages: 30 },
    },
    {
      name: "Bloomberg Technology",
      domain: "bloomberg.com",
      url: "https://www.bloomberg.com/technology",
      category: "FINANCIAL" as const,
      priority: 6,
      crawlPolicy: { maxDepth: 2, maxPages: 30 },
    },
    {
      name: "Reuters Technology",
      domain: "reuters.com",
      url: "https://www.reuters.com/technology",
      category: "FINANCIAL" as const,
      priority: 6,
      crawlPolicy: { maxDepth: 2, maxPages: 30 },
    },
    {
      name: "Financial Times Tech",
      domain: "ft.com",
      url: "https://www.ft.com/technology",
      category: "FINANCIAL" as const,
      priority: 6,
      crawlPolicy: { maxDepth: 2, maxPages: 30 },
    },
    {
      name: "MIT Technology Review",
      domain: "technologyreview.com",
      url: "https://www.technologyreview.com",
      category: "RESEARCH" as const,
      priority: 8,
      crawlPolicy: { maxDepth: 2, maxPages: 30 },
    },
    {
      name: "Towards Data Science",
      domain: "towardsdatascience.com",
      url: "https://towardsdatascience.com",
      category: "TECHNICAL" as const,
      priority: 7,
      crawlPolicy: { maxDepth: 2, maxPages: 50 },
    },
  ]

  for (const source of defaultSources) {
    const domainHash = createHash('sha256').update(source.domain.toLowerCase().trim()).digest('hex')

    await prisma.researchSource.upsert({
      where: { id: `seed-${domainHash.slice(0, 16)}` },
      update: { ...source, jobId: seedJob.id },
      create: {
        id: `seed-${domainHash.slice(0, 16)}`,
        jobId: seedJob.id,
        ...source,
      },
    })
  }

  console.log(`✅ Seeded ${defaultSources.length} research sources`)
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })