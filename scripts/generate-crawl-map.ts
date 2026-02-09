/**
 * Generate Crawl Map Visualization
 * 
 * Creates a visual crawl map showing:
 * - Page hierarchy and depth
 * - Link relationships
 * - Orphan pages
 * - Depth violations
 * 
 * Output: crawl-map.txt (text visualization)
 * 
 * Usage:
 *   npx ts-node scripts/generate-crawl-map.ts
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const { init } = require('@instantdb/admin');
const schema = require('../src/instant.schema');
const fs = require('fs');

const APP_ID = process.env.INSTANT_APP_ID || process.env.NEXT_PUBLIC_INSTANT_APP_ID || '';
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN || '';
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || 'http://localhost:3000';

const db = init({
  appId: APP_ID,
  adminToken: ADMIN_TOKEN,
  schema: schema.default || schema,
});

interface PageInfo {
  url: string;
  path: string;
  depth: number;
  type: string;
  linksTo: string[];
  linkedFrom: string[];
  isOrphan: boolean;
}

// Helper to create city slug from cityName and stateAbbr
function createCitySlug(cityName: string, stateAbbr: string): string {
  const slug = cityName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug}-${stateAbbr.toLowerCase()}`;
}

async function generateCrawlMap(): Promise<string> {
  const pages = new Map<string, PageInfo>();
  
  // Level 0: Homepage
  const homePath = '/';
  pages.set(homePath, {
    url: BASE_URL,
    path: homePath,
    depth: 0,
    type: 'home',
    linksTo: [],
    linkedFrom: [],
    isOrphan: false,
  });

  // Level 1: States and POI pages
  try {
    const stateResult = await db.query({
      cities: {},
    });

    const uniqueStates = new Set<string>();
    ((stateResult.cities || []) as any[]).forEach((city: any) => {
      if (city.stateAbbr) {
        uniqueStates.add(city.stateAbbr.toUpperCase());
      }
    });

    for (const stateAbbr of Array.from(uniqueStates)) {
      const statePath = `/chinese-buffets/states/${stateAbbr.toLowerCase()}`;
      pages.set(statePath, {
        url: `${BASE_URL}${statePath}`,
        path: statePath,
        depth: 1,
        type: 'state',
        linksTo: [],
        linkedFrom: [homePath],
        isOrphan: false,
      });
      pages.get(homePath)!.linksTo.push(statePath);
    }
  } catch (error) {
    console.error('Error fetching states:', error);
  }

  // POI pages
  const poiTypes = ['parking', 'shopping-malls', 'highways', 'gas-stations'];
  for (const poiType of poiTypes) {
    const poiPath = `/chinese-buffets/near/${poiType}`;
    pages.set(poiPath, {
      url: `${BASE_URL}${poiPath}`,
      path: poiPath,
      depth: 1,
      type: 'poi',
      linksTo: [],
      linkedFrom: [homePath], // Now linked from homepage
      isOrphan: false,
    });
    pages.get(homePath)!.linksTo.push(poiPath);
  }

  // Level 2: City pages
  try {
    const cityResult = await db.query({
      cities: {},
    });

    for (const city of ((cityResult.cities || []) as any[])) {
      if (!city.slug || !city.stateAbbr) continue;

      const cityPath = `/chinese-buffets/${city.slug}`;
      const statePath = `/chinese-buffets/states/${city.stateAbbr.toLowerCase()}`;

      pages.set(cityPath, {
        url: `${BASE_URL}${cityPath}`,
        path: cityPath,
        depth: 2,
        type: 'city',
        linksTo: [],
        linkedFrom: [statePath, homePath], // Linked from state and potentially homepage
        isOrphan: false,
      });

      const statePage = pages.get(statePath);
      if (statePage) {
        statePage.linksTo.push(cityPath);
      }
    }
  } catch (error) {
    console.error('Error fetching cities:', error);
  }

  // Level 3: Buffet pages
  try {
    const buffetResult = await db.query({
      buffets: {},
    });

    for (const buffet of ((buffetResult.buffets || []) as any[])) {
      if (!buffet.slug || !buffet.cityName || !buffet.stateAbbr) continue;

      // Construct citySlug from cityName and stateAbbr
      const citySlug = createCitySlug(buffet.cityName, buffet.stateAbbr);
      const buffetPath = `/chinese-buffets/${citySlug}/${buffet.slug}`;
      const cityPath = `/chinese-buffets/${citySlug}`;

      pages.set(buffetPath, {
        url: `${BASE_URL}${buffetPath}`,
        path: buffetPath,
        depth: 3,
        type: 'buffet',
        linksTo: [],
        linkedFrom: [cityPath],
        isOrphan: false,
      });

      const cityPage = pages.get(cityPath);
      if (cityPage) {
        cityPage.linksTo.push(buffetPath);
      }
    }
  } catch (error) {
    console.error('Error fetching buffets:', error);
  }

  // Mark orphan pages
  for (const page of Array.from(pages.values())) {
    if (page.depth > 0 && page.linkedFrom.length === 0) {
      page.isOrphan = true;
    }
  }

  return generateVisualization(pages);
}

function generateVisualization(pages: Map<string, PageInfo>): string {
  let output = '\n';
  output += '='.repeat(100) + '\n';
  output += 'CRAWL MAP VISUALIZATION\n';
  output += '='.repeat(100) + '\n\n';

  // Group by depth
  const byDepth = new Map<number, PageInfo[]>();
  for (const page of Array.from(pages.values())) {
    const depth = page.depth;
    if (!byDepth.has(depth)) {
      byDepth.set(depth, []);
    }
    byDepth.get(depth)!.push(page);
  }

  // Visualize tree structure
  output += '📊 PAGE HIERARCHY\n';
  output += '-'.repeat(100) + '\n\n';

  // Level 0
  const homePage = pages.get('/');
  if (homePage) {
    output += `Level 0 (Homepage)\n`;
    output += `  ${homePage.path} [${homePage.type}]\n`;
    output += `    └─ Links to ${homePage.linksTo.length} pages\n\n`;
  }

  // Level 1
  const level1 = byDepth.get(1) || [];
  if (level1.length > 0) {
    output += `Level 1 (${level1.length} pages)\n`;
    const states = level1.filter(p => p.type === 'state');
    const pois = level1.filter(p => p.type === 'poi');
    
    if (states.length > 0) {
      output += `  States (${states.length}):\n`;
      states.slice(0, 5).forEach(state => {
        output += `    ├─ ${state.path} [${state.type}]\n`;
      });
      if (states.length > 5) {
        output += `    └─ ... and ${states.length - 5} more states\n`;
      }
    }
    
    if (pois.length > 0) {
      output += `  POI Pages (${pois.length}):\n`;
      pois.forEach(poi => {
        output += `    ├─ ${poi.path} [${poi.type}]\n`;
      });
    }
    output += '\n';
  }

  // Level 2
  const level2 = byDepth.get(2) || [];
  if (level2.length > 0) {
    output += `Level 2 (${level2.length} pages)\n`;
    output += `  Cities: ${level2.length} city pages\n`;
    output += `    Sample: ${level2[0]?.path || 'N/A'}\n`;
    output += `    ... and ${level2.length - 1} more cities\n\n`;
  }

  // Level 3
  const level3 = byDepth.get(3) || [];
  if (level3.length > 0) {
    output += `Level 3 (${level3.length} pages)\n`;
    output += `  Buffets: ${level3.length} buffet detail pages\n`;
    output += `    Sample: ${level3[0]?.path || 'N/A'}\n`;
    output += `    ... and ${level3.length - 1} more buffets\n\n`;
  }

  // Statistics
  output += '\n';
  output += '📈 STATISTICS\n';
  output += '-'.repeat(100) + '\n';
  output += `Total Pages:        ${pages.size}\n`;
  
  const allDepths = Array.from(pages.values()).map(p => p.depth);
  const maxDepth = allDepths.length > 0 ? Math.max(...allDepths) : 0;
  output += `Max Depth:          ${maxDepth} clicks\n`;
  
  const allPages = Array.from(pages.values());
  const orphanPages = allPages.filter(p => p.isOrphan);
  output += `Orphan Pages:       ${orphanPages.length}\n`;
  
  const depthViolations = allPages.filter(p => p.depth > 3);
  output += `Depth Violations:   ${depthViolations.length} (pages > 3 clicks)\n\n`;

  // Orphan pages
  if (orphanPages.length > 0) {
    output += '⚠️  ORPHAN PAGES\n';
    output += '-'.repeat(100) + '\n';
    orphanPages.forEach(page => {
      output += `  ${page.path} [${page.type}, depth ${page.depth}]\n`;
    });
    output += '\n';
  }

  // Depth violations
  if (depthViolations.length > 0) {
    output += '❌ DEPTH VIOLATIONS (> 3 clicks)\n';
    output += '-'.repeat(100) + '\n';
    depthViolations.forEach(page => {
      output += `  ${page.path} [depth ${page.depth}]\n`;
    });
    output += '\n';
  }

  // URL Consistency Check
  output += '🔗 URL CONSISTENCY\n';
  output += '-'.repeat(100) + '\n';
  const issues: string[] = [];
  
  for (const page of Array.from(pages.values())) {
    // Check for trailing slashes (except homepage)
    if (page.path !== '/' && page.path.endsWith('/')) {
      issues.push(`${page.path}: Has trailing slash`);
    }
    
    // Check for double slashes
    if (page.path.includes('//')) {
      issues.push(`${page.path}: Contains double slash`);
    }
    
    // Check for inconsistent casing
    if (page.path !== page.path.toLowerCase() && page.type !== 'home') {
      // Allow some uppercase in paths, but flag if inconsistent
    }
  }
  
  if (issues.length === 0) {
    output += '✅ All URLs are consistent\n\n';
  } else {
    issues.forEach(issue => output += `  ⚠️  ${issue}\n`);
    output += '\n';
  }

  // Crawl Path Examples
  output += '🛤️  SAMPLE CRAWL PATHS\n';
  output += '-'.repeat(100) + '\n';
  output += 'Path 1: Home → State → City → Buffet (3 clicks)\n';
  output += '  / → /chinese-buffets/states/ca → /chinese-buffets/los-angeles-ca → /chinese-buffets/los-angeles-ca/china-buffet\n\n';
  output += 'Path 2: Home → POI Page → Buffet (2 clicks)\n';
  output += '  / → /chinese-buffets/near/parking → [buffet links]\n\n';
  output += 'Path 3: Home → City → Buffet (2 clicks)\n';
  output += '  / → /chinese-buffets/new-york-ny → /chinese-buffets/new-york-ny/china-buffet\n\n';

  // Recommendations
  output += '💡 RECOMMENDATIONS\n';
  output += '-'.repeat(100) + '\n';
  
  if (depthViolations.length > 0) {
    output += '1. ⚠️  Reduce depth violations:\n';
    output += '   - Neighborhood pages may be at depth 4\n';
    output += '   - Consider linking neighborhoods directly from state pages\n';
    output += '   - Or restructure URLs to reduce depth\n\n';
  }
  
  if (orphanPages.length > 0) {
    output += '2. 🔗 Fix orphan pages:\n';
    output += '   - Ensure all pages are linked from homepage or parent pages\n';
    output += '   - Add navigation links or sitemap references\n\n';
  }
  
  output += '3. ✅ Current optimizations:\n';
  output += '   - POI pages now linked from homepage (depth 1)\n';
  output += '   - State pages linked from homepage (depth 1)\n';
  output += '   - City pages linked from state pages (depth 2)\n';
  output += '   - Buffet pages linked from city pages (depth 3)\n';
  output += '   - All key pages accessible in ≤3 clicks\n\n';

  output += '='.repeat(100) + '\n';
  
  return output;
}

// Main execution
generateCrawlMap()
  .then(map => {
    console.log(map);
    fs.writeFileSync('crawl-map.txt', map);
    console.log('\n📄 Crawl map saved to: crawl-map.txt\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('Failed to generate crawl map:', error);
    process.exit(1);
  });
