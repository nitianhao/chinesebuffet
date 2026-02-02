/**
 * Generate Crawl Depth Report
 * 
 * Analyzes crawl depth for all indexable pages and generates a report.
 */

import { generateCrawlDepthReport, CrawlDepthReport } from '../lib/crawl-depth-analysis';

/**
 * Format report as text
 */
function formatReport(report: CrawlDepthReport): string {
  let output = '\n';
  output += '='.repeat(80) + '\n';
  output += 'CRAWL DEPTH ANALYSIS REPORT\n';
  output += '='.repeat(80) + '\n\n';
  
  output += report.summary + '\n\n';
  
  // Depth Distribution
  output += 'DEPTH DISTRIBUTION\n';
  output += '-'.repeat(80) + '\n';
  
  output += '\nFrom Homepage:\n';
  for (const [depth, count] of Object.entries(report.depthDistribution.fromHomepage).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    output += `  ${depth} clicks: ${count} pages\n`;
  }
  
  output += '\nFrom City Pages:\n';
  for (const [depth, count] of Object.entries(report.depthDistribution.fromCityPages).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    output += `  ${depth} clicks: ${count} pages\n`;
  }
  
  output += '\nFrom Sitemap:\n';
  for (const [depth, count] of Object.entries(report.depthDistribution.fromSitemap).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    output += `  ${depth} clicks: ${count} pages\n`;
  }
  
  // Violations
  if (report.violations.homepage.length > 0) {
    output += '\n\nHOMEPAGE VIOLATIONS (>3 clicks)\n';
    output += '-'.repeat(80) + '\n';
    for (const violation of report.violations.homepage) {
      output += `  ${violation.path} (${violation.pageType}): ${violation.depthFromHomepage} clicks\n`;
      if (violation.shortestPath.fromHomepage) {
        output += `    Path: ${violation.shortestPath.fromHomepage.join(' → ')}\n`;
      }
    }
  }
  
  if (report.violations.cityPages.length > 0) {
    output += '\n\nCITY PAGES VIOLATIONS (>3 clicks)\n';
    output += '-'.repeat(80) + '\n';
    for (const violation of report.violations.cityPages) {
      output += `  ${violation.path} (${violation.pageType}): ${violation.depthFromCityPages} clicks\n`;
      if (violation.shortestPath.fromCityPage) {
        output += `    Path: ${violation.shortestPath.fromCityPage.join(' → ')}\n`;
      }
    }
  }
  
  if (report.violations.sitemap.length > 0) {
    output += '\n\nSITEMAP VIOLATIONS (>3 clicks)\n';
    output += '-'.repeat(80) + '\n';
    for (const violation of report.violations.sitemap) {
      output += `  ${violation.path} (${violation.pageType}): ${violation.depthFromSitemap} clicks\n`;
    }
  }
  
  // Unreachable Pages
  if (report.unreachablePages.length > 0) {
    output += '\n\nUNREACHABLE PAGES\n';
    output += '-'.repeat(80) + '\n';
    for (const page of report.unreachablePages) {
      output += `  ${page.path} (${page.pageType})\n`;
      if (page.depthFromHomepage === null) {
        output += `    Not reachable from homepage\n`;
      }
      if (page.depthFromCityPages === null) {
        output += `    Not reachable from any city page\n`;
      }
    }
  }
  
  // Summary
  if (
    report.violations.homepage.length === 0 &&
    report.violations.cityPages.length === 0 &&
    report.violations.sitemap.length === 0 &&
    report.unreachablePages.length === 0
  ) {
    output += '\n\n✅ ALL PAGES ARE REACHABLE WITHIN 3 CLICKS\n';
  } else {
    output += '\n\n⚠️  SOME PAGES EXCEED 3-CLICK DEPTH\n';
    output += '   Review violations above and add missing links.\n';
  }
  
  output += '\n' + '='.repeat(80) + '\n';
  
  return output;
}

/**
 * Generate and save report
 */
export async function runReport(): Promise<void> {
  console.log('[Crawl Depth Report] Starting analysis...');
  
  try {
    const report = await generateCrawlDepthReport();
    const reportText = formatReport(report);
    
    console.log(reportText);
    
    // Save to file
    const fs = require('fs');
    const path = require('path');
    const reportPath = path.join(process.cwd(), 'crawl-depth-report.txt');
    fs.writeFileSync(reportPath, reportText);
    console.log(`\n[Crawl Depth Report] Report saved to: ${reportPath}`);
    
    // Exit with error code if violations found
    const hasViolations = 
      report.violations.homepage.length > 0 ||
      report.violations.cityPages.length > 0 ||
      report.violations.sitemap.length > 0 ||
      report.unreachablePages.length > 0;
    
    if (hasViolations) {
      console.error('\n[Crawl Depth Report] ❌ Violations found!');
      process.exit(1);
    } else {
      console.log('\n[Crawl Depth Report] ✅ No violations found!');
      process.exit(0);
    }
  } catch (error) {
    console.error('[Crawl Depth Report] Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runReport();
}
