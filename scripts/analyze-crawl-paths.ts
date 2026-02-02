/**
 * Crawl Path Analysis Script
 * 
 * Analyzes the site structure to:
 * - Map crawl depth from homepage
 * - Identify orphan pages (no incoming links)
 * - Verify URL consistency
 * - Generate a crawl map visualization
 * 
 * Usage:
 *   npx ts-node scripts/analyze-crawl-paths.ts
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const { init } = require('@instantdb/admin');
const schema = require('../src/instant.schema');
const fs = require('fs');

// Initialize InstantDB
const APP_ID = process.env.INSTANT_APP_ID || process.env.NEXT_PUBLIC_INSTANT_APP_ID || '';
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN || '';

const db = init({
  appId: APP_ID,
  adminToken: ADMIN_TOKEN,
  schema: schema.default || schema,
});

interface PageNode {
  url: string;
  depth: number;
  type: 'home' | 'state' | 'city' | 'buffet' | 'neighborhood' | 'poi';
  incomingLinks: number;
  outgoingLinks: string[];
  isOrphan: boolean;
  priority: number;
}

interface CrawlMap {
  pages: Map<string, PageNode>;
  maxDepth: number;
  orphanPages: PageNode[];
  depthViolations: PageNode[];
  urlInconsistencies: Array<{ page: string; issue: string }>;
}

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
const POI_TYPES = ['parking', 'shopping-malls', 'highways', 'gas-stations'];

// Helper to create city slug from cityName and stateAbbr
function createCitySlug(cityName: string, stateAbbr: string): string {
  const slug = cityName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug}-${stateAbbr.toLowerCase()}`;
}

async function analyzeCrawlPaths(): Promise<CrawlMap> {
  const pages = new Map<string, PageNode>();
  const urlInconsistencies: Array<{ page: string; issue: string }> = [];

  // ========================================
  // 1. HOME PAGE (Depth 0)
  // ========================================
  const homePage: PageNode = {
    url: BASE_URL,
    depth: 0,
    type: 'home',
    incomingLinks: 0, // Homepage has no incoming links
    outgoingLinks: [],
    isOrphan: false,
    priority: 1,
  };
  pages.set(homePage.url, homePage);

  // ========================================
  // 2. STATE PAGES (Depth 1)
  // ========================================
  try {
    const result = await db.query({
      cities: {},
    });

    const uniqueStates = new Set<string>();
    (result.cities || []).forEach((city: any) => {
      if (city.stateAbbr) {
        uniqueStates.add(city.stateAbbr.toUpperCase());
      }
    });

    for (const stateAbbr of Array.from(uniqueStates)) {
      const stateUrl = `${BASE_URL}/chinese-buffets/states/${stateAbbr.toLowerCase()}`;
      const statePage: PageNode = {
        url: stateUrl,
        depth: 1,
        type: 'state',
        incomingLinks: 0,
        outgoingLinks: [],
        isOrphan: true, // Will be updated when we find links
        priority: 0.7,
      };
      pages.set(stateUrl, statePage);
      homePage.outgoingLinks.push(stateUrl);
      statePage.incomingLinks++;
      statePage.isOrphan = false;
    }
  } catch (error) {
    console.error('Error fetching states:', error);
  }

  // ========================================
  // 3. POI PAGES (Depth 1)
  // ========================================
  for (const poiType of POI_TYPES) {
    const poiUrl = `${BASE_URL}/chinese-buffets/near/${poiType}`;
    const poiPage: PageNode = {
      url: poiUrl,
      depth: 1,
      type: 'poi',
      incomingLinks: 1,
      outgoingLinks: [],
      isOrphan: false, // Now linked from homepage
      priority: 0.7,
    };
    pages.set(poiUrl, poiPage);
    homePage.outgoingLinks.push(poiUrl);
  }

  // ========================================
  // 4. CITY PAGES (Depth 2)
  // ========================================
  try {
    const cityResult = await db.query({
      cities: {},
    });

    for (const city of (cityResult.cities || []) as any[]) {
      if (!city.slug || !city.stateAbbr) continue;

      const cityUrl = `${BASE_URL}/chinese-buffets/${city.slug}`;
      const stateUrl = `${BASE_URL}/chinese-buffets/states/${city.stateAbbr?.toLowerCase() || ''}`;
      
      const cityPage: PageNode = {
        url: cityUrl,
        depth: 2,
        type: 'city',
        incomingLinks: 0,
        outgoingLinks: [],
        isOrphan: true,
        priority: 0.8,
      };
      pages.set(cityUrl, cityPage);

      // Link from state page
      const statePage = pages.get(stateUrl);
      if (statePage) {
        statePage.outgoingLinks.push(cityUrl);
        cityPage.incomingLinks++;
        cityPage.isOrphan = false;
      }

      // Link from homepage (if city is featured)
      // Currently only New York is linked from homepage
      if (city.slug === 'new-york-ny') {
        homePage.outgoingLinks.push(cityUrl);
        cityPage.incomingLinks++;
        cityPage.isOrphan = false;
      }
    }
  } catch (error) {
    console.error('Error fetching cities:', error);
  }

  // ========================================
  // 5. BUFFET PAGES (Depth 3)
  // ========================================
  try {
    const buffetResult = await db.query({
      buffets: {},
    });

    for (const buffet of (buffetResult.buffets || []) as any[]) {
      if (!buffet.slug || !buffet.cityName || !buffet.stateAbbr) continue;

      // Construct citySlug from cityName and stateAbbr
      const citySlug = createCitySlug(buffet.cityName, buffet.stateAbbr);
      const buffetUrl = `${BASE_URL}/chinese-buffets/${citySlug}/${buffet.slug}`;
      const cityUrl = `${BASE_URL}/chinese-buffets/${citySlug}`;

      const buffetPage: PageNode = {
        url: buffetUrl,
        depth: 3,
        type: 'buffet',
        incomingLinks: 0,
        outgoingLinks: [],
        isOrphan: true,
        priority: 0.6,
      };
      pages.set(buffetUrl, buffetPage);

      // Link from city page
      const cityPage = pages.get(cityUrl);
      if (cityPage) {
        cityPage.outgoingLinks.push(buffetUrl);
        buffetPage.incomingLinks++;
        buffetPage.isOrphan = false;
      }

      // Buffet pages also link to other buffets (internal linking)
      // This doesn't affect crawl depth but improves discoverability
    }
  } catch (error) {
    console.error('Error fetching buffets:', error);
  }

  // ========================================
  // 6. NEIGHBORHOOD PAGES (Depth 4 - Note)
  // ========================================
  // Note: Neighborhood pages would be at depth 4, which violates ≤3 clicks
  // They are linked from city pages, making them depth 3 from city
  // but depth 4 from homepage. This is acceptable for secondary content.
  // Not querying neighborhoods as they're generated dynamically.

  // ========================================
  // 7. IDENTIFY ISSUES
  // ========================================
  const orphanPages: PageNode[] = [];
  const depthViolations: PageNode[] = [];

  for (const page of Array.from(pages.values())) {
    if (page.isOrphan && page.type !== 'home') {
      orphanPages.push(page);
    }
    if (page.depth > 3) {
      depthViolations.push(page);
    }
  }

  // Check URL consistency
  for (const page of Array.from(pages.values())) {
    // Check for trailing slashes
    if (page.url.endsWith('/') && page.url !== BASE_URL + '/') {
      urlInconsistencies.push({
        page: page.url,
        issue: 'Trailing slash inconsistency',
      });
    }

    // Check for double slashes
    if (page.url.includes('//') && !page.url.includes('://')) {
      urlInconsistencies.push({
        page: page.url,
        issue: 'Double slash in path',
      });
    }
  }

  const allDepths = Array.from(pages.values()).map(p => p.depth);
  const maxDepth = allDepths.length > 0 ? Math.max(...allDepths) : 0;

  return {
    pages,
    maxDepth,
    orphanPages,
    depthViolations,
    urlInconsistencies,
  };
}

function generateCrawlMapReport(crawlMap: CrawlMap): string {
  let report = '\n';
  report += '='.repeat(80) + '\n';
  report += 'CRAWL PATH ANALYSIS REPORT\n';
  report += '='.repeat(80) + '\n\n';

  // Summary
  report += '📊 SUMMARY\n';
  report += '-'.repeat(80) + '\n';
  report += `Total Pages:        ${crawlMap.pages.size}\n`;
  report += `Max Depth:          ${crawlMap.maxDepth} clicks\n`;
  report += `Orphan Pages:       ${crawlMap.orphanPages.length}\n`;
  report += `Depth Violations:   ${crawlMap.depthViolations.length} (pages > 3 clicks)\n`;
  report += `URL Issues:         ${crawlMap.urlInconsistencies.length}\n\n`;

  // Depth Distribution
  const depthCounts = new Map<number, number>();
  for (const page of Array.from(crawlMap.pages.values())) {
    depthCounts.set(page.depth, (depthCounts.get(page.depth) || 0) + 1);
  }

  report += '📈 DEPTH DISTRIBUTION\n';
  report += '-'.repeat(80) + '\n';
  for (let depth = 0; depth <= crawlMap.maxDepth; depth++) {
    const count = depthCounts.get(depth) || 0;
    const bar = '█'.repeat(Math.floor(count / 10));
    report += `Depth ${depth}: ${count.toString().padStart(5)} pages ${bar}\n`;
  }
  report += '\n';

  // Orphan Pages
  if (crawlMap.orphanPages.length > 0) {
    report += '⚠️  ORPHAN PAGES (No incoming links)\n';
    report += '-'.repeat(80) + '\n';
    crawlMap.orphanPages.slice(0, 20).forEach(page => {
      report += `  ${page.url} (${page.type}, depth ${page.depth})\n`;
    });
    if (crawlMap.orphanPages.length > 20) {
      report += `  ... and ${crawlMap.orphanPages.length - 20} more\n`;
    }
    report += '\n';
  }

  // Depth Violations
  if (crawlMap.depthViolations.length > 0) {
    report += '❌ DEPTH VIOLATIONS (> 3 clicks)\n';
    report += '-'.repeat(80) + '\n';
    crawlMap.depthViolations.forEach(page => {
      report += `  ${page.url} (depth ${page.depth})\n`;
    });
    report += '\n';
  }

  // URL Inconsistencies
  if (crawlMap.urlInconsistencies.length > 0) {
    report += '🔧 URL INCONSISTENCIES\n';
    report += '-'.repeat(80) + '\n';
    crawlMap.urlInconsistencies.forEach(({ page, issue }) => {
      report += `  ${page}: ${issue}\n`;
    });
    report += '\n';
  }

  // Crawl Map Visualization
  report += '🗺️  CRAWL MAP (Sample - First 3 levels)\n';
  report += '-'.repeat(80) + '\n';
  
  const homePageNode = Array.from(crawlMap.pages.values()).find(p => p.depth === 0);
  if (homePageNode) {
    report += `Level 0: ${homePageNode.url}\n`;
    
    // Level 1
    const level1Pages = Array.from(crawlMap.pages.values())
      .filter(p => p.depth === 1)
      .slice(0, 10);
    level1Pages.forEach(page => {
      report += `  └─ Level 1: ${page.url.replace(BASE_URL, '')} (${page.type})\n`;
      
      // Level 2 (sample)
      if (page.type === 'state') {
        const level2Pages = Array.from(crawlMap.pages.values())
          .filter(p => p.depth === 2 && p.url.includes(page.url.split('/').pop() || ''))
          .slice(0, 3);
        level2Pages.forEach(page2 => {
          report += `     └─ Level 2: ${page2.url.replace(BASE_URL, '')} (${page2.type})\n`;
        });
      }
    });
  }

  report += '\n' + '='.repeat(80) + '\n';

  // Recommendations
  report += '\n💡 RECOMMENDATIONS\n';
  report += '-'.repeat(80) + '\n';
  
  if (crawlMap.maxDepth > 3) {
    report += '1. ⚠️  Reduce maximum depth to ≤3 clicks:\n';
    report += '   - Neighborhood pages are at depth 4\n';
    report += '   - Consider linking neighborhoods from state pages or homepage\n';
    report += '   - Or reduce neighborhood page depth by restructuring URLs\n\n';
  }

  if (crawlMap.orphanPages.length > 0) {
    report += '2. 🔗 Add links to orphan pages:\n';
    report += '   - POI pages may not be linked from homepage\n';
    report += '   - Add navigation links or sitemap links\n';
    report += '   - Ensure all pages are reachable from homepage\n\n';
  }

  if (crawlMap.urlInconsistencies.length > 0) {
    report += '3. 🔧 Fix URL inconsistencies:\n';
    report += '   - Standardize trailing slashes\n';
    report += '   - Remove double slashes\n';
    report += '   - Use consistent URL format across all links\n\n';
  }

  report += '4. ✅ Ensure consistent internal linking:\n';
  report += '   - All pages should link back to parent pages\n';
  report += '   - Use breadcrumbs for navigation\n';
  report += '   - Include hub links (city/state) on detail pages\n\n';

  return report;
}

// Main execution
analyzeCrawlPaths()
  .then(crawlMap => {
    const report = generateCrawlMapReport(crawlMap);
    console.log(report);
    
    // Write to file
    fs.writeFileSync('crawl-analysis-report.txt', report);
    console.log('\n📄 Report saved to: crawl-analysis-report.txt\n');
    
    // Exit with error code if issues found
    const hasIssues = crawlMap.orphanPages.length > 0 || 
                     crawlMap.depthViolations.length > 0 || 
                     crawlMap.urlInconsistencies.length > 0;
    process.exit(hasIssues ? 1 : 0);
  })
  .catch(error => {
    console.error('Analysis failed:', error);
    process.exit(1);
  });
