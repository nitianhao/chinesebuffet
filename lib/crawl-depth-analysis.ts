/**
 * Crawl Depth Analysis
 * 
 * Analyzes crawl depth for all indexable pages from:
 * - Homepage
 * - City pages
 * - Sitemap
 * 
 * Ensures all pages are reachable within 3 clicks.
 */

import { getAllCitySlugs, getCityBySlug, getStateByAbbr, getAllStateAbbrs } from './data-instantdb';
import { isPageIndexable, PageType, IndexTier } from './index-tier';
import { assessPOIPageQuality } from './poi-page-quality';

export interface PageNode {
  path: string;
  pageType: PageType;
  tier: IndexTier;
  isIndexable: boolean;
  linksTo: string[]; // Paths this page links to
  linkedFrom: string[]; // Paths that link to this page
}

export interface CrawlDepthResult {
  path: string;
  pageType: PageType;
  depthFromHomepage: number | null; // null if unreachable
  depthFromCityPages: number | null; // Minimum depth from any city page
  depthFromSitemap: number; // Always 0 (sitemap is direct)
  shortestPath: {
    fromHomepage: string[] | null;
    fromCityPage: string[] | null;
    fromSitemap: string[];
  };
  violations: {
    homepage: boolean; // > 3 clicks from homepage
    cityPages: boolean; // > 3 clicks from any city page
    sitemap: boolean; // > 3 clicks from sitemap (shouldn't happen)
  };
}

export interface CrawlDepthReport {
  totalPages: number;
  indexablePages: number;
  violations: {
    homepage: CrawlDepthResult[];
    cityPages: CrawlDepthResult[];
    sitemap: CrawlDepthResult[];
  };
  depthDistribution: {
    fromHomepage: Record<number, number>;
    fromCityPages: Record<number, number>;
    fromSitemap: Record<number, number>;
  };
  unreachablePages: CrawlDepthResult[];
  summary: string;
}

/**
 * Build page graph from all pages
 */
export async function buildPageGraph(): Promise<Map<string, PageNode>> {
  const graph = new Map<string, PageNode>();
  
  // Homepage
  graph.set('/', {
    path: '/',
    pageType: 'home',
    tier: 'tier-1',
    isIndexable: true,
    linksTo: [],
    linkedFrom: [],
  });
  
  // State pages
  const stateAbbrs = await getAllStateAbbrs();
  for (const stateAbbr of stateAbbrs) {
    const statePath = `/chinese-buffets/states/${stateAbbr.toLowerCase()}`;
    graph.set(statePath, {
      path: statePath,
      pageType: 'state',
      tier: 'tier-1',
      isIndexable: true,
      linksTo: [],
      linkedFrom: ['/'], // Linked from homepage via StatesSection
    });
    // Homepage links to state pages
    graph.get('/')!.linksTo.push(statePath);
  }
  
  // POI pages
  const poiTypes = ['parking', 'shopping-malls', 'highways', 'gas-stations'];
  const { 
    getBuffetsWithParking, 
    getBuffetsNearShoppingMalls, 
    getBuffetsNearHighways, 
    getBuffetsNearGasStations 
  } = await import('./data-instantdb');
  
  const poiConfigs = {
    'parking': {
      title: 'Chinese Buffets with Parking',
      description: 'Find Chinese buffets with convenient parking nearby.',
      metaDescription: 'Discover Chinese buffets with parking available nearby.',
      fetchFunction: getBuffetsWithParking,
    },
    'shopping-malls': {
      title: 'Chinese Buffets Near Shopping Malls',
      description: 'Chinese buffets conveniently located near shopping malls.',
      metaDescription: 'Find Chinese buffets near shopping malls and retail centers.',
      fetchFunction: getBuffetsNearShoppingMalls,
    },
    'highways': {
      title: 'Chinese Buffets Near Highways',
      description: 'Chinese buffets located near major highways and freeways.',
      metaDescription: 'Discover Chinese buffets near major highways and freeways.',
      fetchFunction: getBuffetsNearHighways,
    },
    'gas-stations': {
      title: 'Chinese Buffets Near Gas Stations',
      description: 'Chinese buffets conveniently located near gas stations.',
      metaDescription: 'Find Chinese buffets near gas stations.',
      fetchFunction: getBuffetsNearGasStations,
    },
  };
  
  for (const poiType of poiTypes) {
    const poiPath = `/chinese-buffets/near/${poiType}`;
    
    // Check if indexable (conditional indexing)
    try {
      const config = poiConfigs[poiType as keyof typeof poiConfigs];
      const buffets = await config.fetchFunction(100);
      const qualityResult = assessPOIPageQuality(
        poiType,
        buffets.length,
        config.title,
        config.description,
        config.metaDescription,
        config.description,
        5,
        200
      );
      
      graph.set(poiPath, {
        path: poiPath,
        pageType: 'poi',
        tier: 'tier-2',
        isIndexable: qualityResult.indexable,
        linksTo: [],
        linkedFrom: ['/'], // Linked from homepage
      });
      
      if (qualityResult.indexable) {
        graph.get('/')!.linksTo.push(poiPath);
      }
    } catch (error) {
      console.error(`Error checking POI page ${poiType}:`, error);
      // Default to indexable if check fails (assume it's indexable)
      graph.set(poiPath, {
        path: poiPath,
        pageType: 'poi',
        tier: 'tier-2',
        isIndexable: true,
        linksTo: [],
        linkedFrom: ['/'],
      });
      graph.get('/')!.linksTo.push(poiPath);
    }
  }
  
  // City pages and their buffets
  const citySlugs = await getAllCitySlugs();
  for (const citySlug of citySlugs) {
    try {
      const city = await getCityBySlug(citySlug);
      if (!city) continue;
      
      const cityPath = `/chinese-buffets/${citySlug}`;
      
      // City page
      graph.set(cityPath, {
        path: cityPath,
        pageType: 'city',
        tier: 'tier-1',
        isIndexable: true,
        linksTo: [],
        linkedFrom: [`/chinese-buffets/states/${city.stateAbbr.toLowerCase()}`], // Linked from state page
      });
      
      // State page links to city page
      const statePath = `/chinese-buffets/states/${city.stateAbbr.toLowerCase()}`;
      if (graph.has(statePath)) {
        graph.get(statePath)!.linksTo.push(cityPath);
      }
      
      // Buffet pages
      for (const buffet of city.buffets) {
        const buffetPath = `/chinese-buffets/${citySlug}/${buffet.slug}`;
        graph.set(buffetPath, {
          path: buffetPath,
          pageType: 'buffet',
          tier: 'tier-2',
          isIndexable: true, // All buffet pages are indexable per rules
          linksTo: [],
          linkedFrom: [cityPath], // Linked from city page
        });
        
        // City page links to buffet pages
        graph.get(cityPath)!.linksTo.push(buffetPath);
      }
      
      // Neighborhood pages
      if (city.neighborhoods && Array.isArray(city.neighborhoods)) {
        for (const neighborhood of city.neighborhoods) {
          const neighborhoodPath = `/chinese-buffets/${citySlug}/neighborhoods/${neighborhood.slug}`;
          const isIndexable = (neighborhood.buffetCount || 0) > 0; // Only indexable if has buffets
          
          graph.set(neighborhoodPath, {
            path: neighborhoodPath,
            pageType: 'neighborhood',
            tier: 'tier-3',
            isIndexable,
            linksTo: [],
            linkedFrom: [cityPath], // Linked from city page
          });
          
          if (isIndexable) {
            graph.get(cityPath)!.linksTo.push(neighborhoodPath);
          }
        }
      }
    } catch (error) {
      console.error(`Error processing city ${citySlug}:`, error);
    }
  }
  
  return graph;
}

/**
 * Calculate shortest path using BFS
 */
function calculateShortestPath(
  graph: Map<string, PageNode>,
  startPath: string,
  targetPath: string
): string[] | null {
  if (startPath === targetPath) return [startPath];
  if (!graph.has(startPath) || !graph.has(targetPath)) return null;
  
  const queue: { path: string; pathHistory: string[] }[] = [{ path: startPath, pathHistory: [startPath] }];
  const visited = new Set<string>([startPath]);
  
  while (queue.length > 0) {
    const { path, pathHistory } = queue.shift()!;
    const node = graph.get(path);
    
    if (!node) continue;
    
    for (const linkedPath of node.linksTo) {
      if (linkedPath === targetPath) {
        return [...pathHistory, linkedPath];
      }
      
      if (!visited.has(linkedPath)) {
        visited.add(linkedPath);
        queue.push({ path: linkedPath, pathHistory: [...pathHistory, linkedPath] });
      }
    }
  }
  
  return null;
}

/**
 * Calculate crawl depth for all pages
 */
export async function calculateCrawlDepths(): Promise<CrawlDepthResult[]> {
  const graph = await buildPageGraph();
  const results: CrawlDepthResult[] = [];
  
  // Get all city page paths
  const cityPaths = Array.from(graph.values())
    .filter(node => node.pageType === 'city' && node.isIndexable)
    .map(node => node.path);
  
  // Analyze each indexable page
  for (const [path, node] of graph.entries()) {
    if (!node.isIndexable) continue;
    
    // Depth from homepage
    const homepagePath = calculateShortestPath(graph, '/', path);
    const depthFromHomepage = homepagePath ? homepagePath.length - 1 : null;
    
    // Depth from city pages (minimum from any city page)
    let minCityDepth: number | null = null;
    let minCityPath: string[] | null = null;
    
    for (const cityPath of cityPaths) {
      const cityPathResult = calculateShortestPath(graph, cityPath, path);
      if (cityPathResult) {
        const depth = cityPathResult.length - 1;
        if (minCityDepth === null || depth < minCityDepth) {
          minCityDepth = depth;
          minCityPath = cityPathResult;
        }
      }
    }
    
    // Depth from sitemap (always 0, sitemap is direct)
    const depthFromSitemap = 0;
    const sitemapPath = [path]; // Direct from sitemap
    
    // Check violations
    const violations = {
      homepage: depthFromHomepage !== null && depthFromHomepage > 3,
      cityPages: minCityDepth !== null && minCityDepth > 3,
      sitemap: depthFromSitemap > 3, // Should never happen
    };
    
    results.push({
      path,
      pageType: node.pageType,
      depthFromHomepage,
      depthFromCityPages: minCityDepth,
      depthFromSitemap,
      shortestPath: {
        fromHomepage: homepagePath,
        fromCityPage: minCityPath,
        fromSitemap: sitemapPath,
      },
      violations,
    });
  }
  
  return results;
}

/**
 * Generate crawl depth report
 */
export async function generateCrawlDepthReport(): Promise<CrawlDepthReport> {
  const results = await calculateCrawlDepths();
  
  const violations = {
    homepage: results.filter(r => r.violations.homepage),
    cityPages: results.filter(r => r.violations.cityPages),
    sitemap: results.filter(r => r.violations.sitemap),
  };
  
  const unreachablePages = results.filter(r => 
    r.depthFromHomepage === null || r.depthFromCityPages === null
  );
  
  // Depth distribution
  const depthDistribution = {
    fromHomepage: {} as Record<number, number>,
    fromCityPages: {} as Record<number, number>,
    fromSitemap: {} as Record<number, number>,
  };
  
  for (const result of results) {
    if (result.depthFromHomepage !== null) {
      depthDistribution.fromHomepage[result.depthFromHomepage] = 
        (depthDistribution.fromHomepage[result.depthFromHomepage] || 0) + 1;
    }
    
    if (result.depthFromCityPages !== null) {
      depthDistribution.fromCityPages[result.depthFromCityPages] = 
        (depthDistribution.fromCityPages[result.depthFromCityPages] || 0) + 1;
    }
    
    depthDistribution.fromSitemap[result.depthFromSitemap] = 
      (depthDistribution.fromSitemap[result.depthFromSitemap] || 0) + 1;
  }
  
  const summary = `
Total Pages: ${results.length}
Homepage Violations (>3 clicks): ${violations.homepage.length}
City Pages Violations (>3 clicks): ${violations.cityPages.length}
Sitemap Violations (>3 clicks): ${violations.sitemap.length}
Unreachable Pages: ${unreachablePages.length}
  `.trim();
  
  return {
    totalPages: results.length,
    indexablePages: results.length,
    violations,
    depthDistribution,
    unreachablePages,
    summary,
  };
}
