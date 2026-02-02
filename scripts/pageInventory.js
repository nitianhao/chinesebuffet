#!/usr/bin/env node

/**
 * Page Inventory Script
 * 
 * Scans the /app directory and outputs a complete page inventory.
 * 
 * Usage: node scripts/pageInventory.js
 * Output: /page-structure.json
 */

const fs = require('fs');
const path = require('path');

const APP_DIR = path.join(__dirname, '..', 'app');
const OUTPUT_FILE = path.join(__dirname, '..', 'page-structure.json');

// Files that indicate a page route
const PAGE_FILES = ['page.tsx', 'page.jsx', 'page.ts', 'page.js'];

// Directories to ignore
const IGNORED_DIRS = ['api', 'node_modules', '.next'];

// Special files to ignore (not page files)
const SPECIAL_FILES = [
  'layout.tsx', 'layout.jsx', 'layout.ts', 'layout.js',
  'loading.tsx', 'loading.jsx', 'loading.ts', 'loading.js',
  'error.tsx', 'error.jsx', 'error.ts', 'error.js',
  'not-found.tsx', 'not-found.jsx', 'not-found.ts', 'not-found.js',
  'template.tsx', 'template.jsx', 'template.ts', 'template.js',
  'default.tsx', 'default.jsx', 'default.ts', 'default.js',
  'route.tsx', 'route.jsx', 'route.ts', 'route.js',
  'global-error.tsx', 'global-error.jsx', 'global-error.ts', 'global-error.js',
];

/**
 * Check if a directory name is a route group (wrapped in parentheses)
 * Route groups don't affect the URL structure
 */
function isRouteGroup(dirName) {
  return dirName.startsWith('(') && dirName.endsWith(')');
}

/**
 * Check if a directory name is a dynamic segment
 * e.g., [slug], [city-state], [...catchAll], [[...optionalCatchAll]]
 */
function isDynamicSegment(segment) {
  return segment.startsWith('[') && segment.endsWith(']');
}

/**
 * Extract the parameter name from a dynamic segment
 * e.g., [slug] -> slug, [...catchAll] -> catchAll, [[...optional]] -> optional
 */
function extractParamName(segment) {
  // Remove outer brackets
  let param = segment.slice(1, -1);
  
  // Handle optional catch-all [[...param]]
  if (param.startsWith('[') && param.endsWith(']')) {
    param = param.slice(1, -1);
  }
  
  // Handle catch-all [...param]
  if (param.startsWith('...')) {
    param = param.slice(3);
  }
  
  return param;
}

/**
 * Get the type of dynamic segment
 */
function getSegmentType(segment) {
  const inner = segment.slice(1, -1);
  
  if (inner.startsWith('[') && inner.endsWith(']')) {
    return 'optionalCatchAll';
  }
  
  if (inner.startsWith('...')) {
    return 'catchAll';
  }
  
  return 'dynamic';
}

/**
 * Convert file path segments to URL path
 * Handles route groups by removing them from the URL
 */
function segmentsToUrlPath(segments) {
  const urlSegments = segments.filter(seg => !isRouteGroup(seg));
  
  if (urlSegments.length === 0) {
    return '/';
  }
  
  return '/' + urlSegments.join('/');
}

/**
 * Recursively scan directory for page files
 */
function scanDirectory(dir, segments = []) {
  const pages = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    // Check if current directory has a page file
    const hasPageFile = entries.some(
      entry => entry.isFile() && PAGE_FILES.includes(entry.name)
    );
    
    if (hasPageFile) {
      const pageFile = entries.find(
        entry => entry.isFile() && PAGE_FILES.includes(entry.name)
      );
      
      const urlPath = segmentsToUrlPath(segments);
      const filePath = path.relative(
        path.join(__dirname, '..'),
        path.join(dir, pageFile.name)
      );
      
      // Extract dynamic parameters
      const dynamicParams = segments
        .filter(isDynamicSegment)
        .map(seg => ({
          name: extractParamName(seg),
          segment: seg,
          type: getSegmentType(seg),
        }));
      
      // Calculate depth (excluding route groups)
      const urlSegments = segments.filter(seg => !isRouteGroup(seg));
      const depth = urlSegments.length;
      
      pages.push({
        urlPath,
        filePath,
        dynamicParams: dynamicParams.length > 0 ? dynamicParams : [],
        depth,
        hasDynamicSegments: dynamicParams.length > 0,
      });
    }
    
    // Recursively scan subdirectories
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const dirName = entry.name;
      
      // Skip ignored directories
      if (IGNORED_DIRS.includes(dirName)) continue;
      
      // Skip hidden directories
      if (dirName.startsWith('.')) continue;
      
      // Skip directories that look like XML sitemaps (*.xml folders)
      if (dirName.endsWith('.xml')) continue;
      
      const subDir = path.join(dir, dirName);
      
      // For route groups, don't add to segments (they don't affect URL)
      const newSegments = isRouteGroup(dirName)
        ? segments
        : [...segments, dirName];
      
      const subPages = scanDirectory(subDir, newSegments);
      pages.push(...subPages);
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error.message);
  }
  
  return pages;
}

/**
 * Sort pages by URL path for better readability
 */
function sortPages(pages) {
  return pages.sort((a, b) => {
    // Sort by depth first
    if (a.depth !== b.depth) {
      return a.depth - b.depth;
    }
    // Then alphabetically by URL path
    return a.urlPath.localeCompare(b.urlPath);
  });
}

/**
 * Generate summary statistics
 */
function generateSummary(pages) {
  const totalPages = pages.length;
  const staticPages = pages.filter(p => !p.hasDynamicSegments).length;
  const dynamicPages = pages.filter(p => p.hasDynamicSegments).length;
  
  const depthDistribution = {};
  pages.forEach(p => {
    depthDistribution[p.depth] = (depthDistribution[p.depth] || 0) + 1;
  });
  
  const allParams = new Set();
  pages.forEach(p => {
    p.dynamicParams.forEach(dp => allParams.add(dp.name));
  });
  
  return {
    totalPages,
    staticPages,
    dynamicPages,
    depthDistribution,
    uniqueDynamicParams: Array.from(allParams).sort(),
  };
}

/**
 * Main function
 */
function main() {
  console.log('Scanning app directory for pages...\n');
  
  if (!fs.existsSync(APP_DIR)) {
    console.error(`Error: App directory not found at ${APP_DIR}`);
    process.exit(1);
  }
  
  const pages = scanDirectory(APP_DIR);
  const sortedPages = sortPages(pages);
  const summary = generateSummary(sortedPages);
  
  const output = {
    generatedAt: new Date().toISOString(),
    summary,
    pages: sortedPages,
  };
  
  // Write to file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  
  // Print summary to console
  console.log('Page Inventory Summary');
  console.log('======================');
  console.log(`Total pages: ${summary.totalPages}`);
  console.log(`Static pages: ${summary.staticPages}`);
  console.log(`Dynamic pages: ${summary.dynamicPages}`);
  console.log('\nDepth distribution:');
  Object.entries(summary.depthDistribution)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([depth, count]) => {
      console.log(`  Depth ${depth}: ${count} page(s)`);
    });
  
  if (summary.uniqueDynamicParams.length > 0) {
    console.log('\nUnique dynamic parameters:');
    summary.uniqueDynamicParams.forEach(param => {
      console.log(`  - ${param}`);
    });
  }
  
  console.log('\nPages found:');
  sortedPages.forEach(page => {
    const dynamicInfo = page.hasDynamicSegments
      ? ` [${page.dynamicParams.map(p => p.name).join(', ')}]`
      : '';
    console.log(`  ${page.urlPath}${dynamicInfo}`);
  });
  
  console.log(`\nOutput saved to: ${OUTPUT_FILE}`);
}

main();
