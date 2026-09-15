import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

async function seedSources() {
  const sources = [
    {
      id: 'src-github',
      jobId: 'seed-global',
      name: 'GitHub',
      domain: 'github.com',
      url: 'https://github.com',
      category: 'TECHNICAL',
      priority: 10,
      sourceType: 'WEB',
      enabled: true,
      crawlPolicy: { maxDepth: 2, maxPages: 100 },
    },
    {
      id: 'src-reddit',
      jobId: 'seed-global',
      name: 'Reddit',
      domain: 'reddit.com',
      url: 'https://reddit.com',
      category: 'COMMUNITY',
      priority: 9,
      sourceType: 'WEB',
      enabled: true,
      crawlPolicy: { maxDepth: 2, maxPages: 100 },
    },
    {
      id: 'src-stackoverflow',
      jobId: 'seed-global',
      name: 'Stack Overflow',
      domain: 'stackoverflow.com',
      url: 'https://stackoverflow.com',
      category: 'TECHNICAL',
      priority: 9,
      sourceType: 'WEB',
      enabled: true,
      crawlPolicy: { maxDepth: 2, maxPages: 100 },
    },
    {
      id: 'src-hackernews',
      jobId: 'seed-global',
      name: 'Hacker News',
      domain: 'news.ycombinator.com',
      url: 'https://news.ycombinator.com',
      category: 'COMMUNITY',
      priority: 8,
      sourceType: 'WEB',
      enabled: true,
      crawlPolicy: { maxDepth: 1, maxPages: 50 },
    },
    {
      id: 'src-devto',
      jobId: 'seed-global',
      name: 'DEV Community',
      domain: 'dev.to',
      url: 'https://dev.to',
      category: 'TECHNICAL',
      priority: 7,
      sourceType: 'WEB',
      enabled: true,
      crawlPolicy: { maxDepth: 2, maxPages: 100 },
    },
    {
      id: 'src-medium',
      jobId: 'seed-global',
      name: 'Medium',
      domain: 'medium.com',
      url: 'https://medium.com',
      category: 'COMMUNITY',
      priority: 6,
      sourceType: 'WEB',
      enabled: true,
      crawlPolicy: { maxDepth: 2, maxPages: 100 },
    },
  ];

  for (const source of sources) {
    await prisma.researchSource.upsert({
      where: { id: source.id },
      update: source,
      create: source,
    });
    console.log('Seeded:', source.name);
  }
  
  console.log('Done seeding sources');
  await prisma.$disconnect();
}

seedSources().catch(e => { console.error(e); process.exit(1); });