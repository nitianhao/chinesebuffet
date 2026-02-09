/**
 * Staged Indexing Status Report
 * 
 * Shows which cities are indexed in each phase and current rollout status.
 */

import { getStagedIndexingConfig, getCitiesByTier, isCityIndexable } from '../lib/staged-indexing';

/**
 * Generate status report
 */
export async function generateStatusReport(): Promise<string> {
  const config = getStagedIndexingConfig();
  const { top, midTier, longTail } = await getCitiesByTier();
  
  let output = '\n';
  output += '='.repeat(80) + '\n';
  output += 'STAGED INDEXING ROLLOUT STATUS\n';
  output += '='.repeat(80) + '\n\n';
  
  // Configuration
  output += 'CONFIGURATION\n';
  output += '-'.repeat(80) + '\n';
  output += `Enabled: ${config.enabled ? '✅ Yes' : '❌ No'}\n`;
  output += `Current Phase: ${config.currentPhase}\n\n`;
  
  if (!config.enabled) {
    output += '⚠️  Staged indexing is DISABLED. All cities are indexed.\n\n';
  } else {
    output += 'Phase Thresholds:\n';
    output += `  Phase 1 (Top Cities):\n`;
    output += `    Max Rank: ${config.phase1Threshold.maxRank || 'N/A'}\n`;
    output += `    Min Population: ${config.phase1Threshold.minPopulation?.toLocaleString() || 'N/A'}\n`;
    output += `    Min Buffet Count: ${config.phase1Threshold.minBuffetCount || 'N/A'}\n`;
    output += `  Phase 2 (Mid-Tier):\n`;
    output += `    Max Rank: ${config.phase2Threshold.maxRank || 'N/A'}\n`;
    output += `    Min Population: ${config.phase2Threshold.minPopulation?.toLocaleString() || 'N/A'}\n`;
    output += `    Min Buffet Count: ${config.phase2Threshold.minBuffetCount || 'N/A'}\n`;
    output += `  Phase 3 (Long-Tail):\n`;
    output += `    Max Rank: ${config.phase3Threshold.maxRank || 'N/A'}\n`;
    output += `    Min Population: ${config.phase3Threshold.minPopulation?.toLocaleString() || 'N/A'}\n`;
    output += `    Min Buffet Count: ${config.phase3Threshold.minBuffetCount || 'N/A'}\n\n`;
  }
  
  // City counts by tier
  output += 'CITY COUNTS BY TIER\n';
  output += '-'.repeat(80) + '\n';
  output += `Top Cities: ${top.length}\n`;
  output += `Mid-Tier Cities: ${midTier.length}\n`;
  output += `Long-Tail Cities: ${longTail.length}\n`;
  output += `Total Cities: ${top.length + midTier.length + longTail.length}\n\n`;
  
  // Current phase status
  output += 'CURRENT PHASE STATUS\n';
  output += '-'.repeat(80) + '\n';
  
  if (config.currentPhase === 'phase-1') {
    output += `✅ Indexing: Top cities only (${top.length} cities)\n`;
    output += `⏸️  Pending: Mid-tier cities (${midTier.length} cities)\n`;
    output += `⏸️  Pending: Long-tail cities (${longTail.length} cities)\n`;
  } else if (config.currentPhase === 'phase-2') {
    output += `✅ Indexing: Top cities (${top.length} cities)\n`;
    output += `✅ Indexing: Mid-tier cities (${midTier.length} cities)\n`;
    output += `⏸️  Pending: Long-tail cities (${longTail.length} cities)\n`;
  } else if (config.currentPhase === 'phase-3') {
    output += `✅ Indexing: Top cities (${top.length} cities)\n`;
    output += `✅ Indexing: Mid-tier cities (${midTier.length} cities)\n`;
    output += `✅ Indexing: Long-tail cities (${longTail.length} cities)\n`;
  } else {
    output += `✅ Indexing: All cities (${top.length + midTier.length + longTail.length} cities)\n`;
  }
  
  output += '\n';
  
  // Sample cities by tier
  if (top.length > 0) {
    output += 'TOP CITIES (Sample)\n';
    output += '-'.repeat(80) + '\n';
    for (const city of top.slice(0, 10)) {
      const indexed = isCityIndexable(city, config);
      output += `  ${indexed ? '✅' : '⏸️'} ${city.city}, ${city.state} (Rank: ${city.rank || 'N/A'}, Population: ${city.population?.toLocaleString() || 'N/A'}, Buffets: ${city.buffetCount})\n`;
    }
    if (top.length > 10) {
      output += `  ... and ${top.length - 10} more\n`;
    }
    output += '\n';
  }
  
  if (midTier.length > 0) {
    output += 'MID-TIER CITIES (Sample)\n';
    output += '-'.repeat(80) + '\n';
    for (const city of midTier.slice(0, 10)) {
      const indexed = isCityIndexable(city, config);
      output += `  ${indexed ? '✅' : '⏸️'} ${city.city}, ${city.state} (Rank: ${city.rank || 'N/A'}, Population: ${city.population?.toLocaleString() || 'N/A'}, Buffets: ${city.buffetCount})\n`;
    }
    if (midTier.length > 10) {
      output += `  ... and ${midTier.length - 10} more\n`;
    }
    output += '\n';
  }
  
  if (longTail.length > 0) {
    output += 'LONG-TAIL CITIES (Sample)\n';
    output += '-'.repeat(80) + '\n';
    for (const city of longTail.slice(0, 10)) {
      const indexed = isCityIndexable(city, config);
      output += `  ${indexed ? '✅' : '⏸️'} ${city.city}, ${city.state} (Rank: ${city.rank || 'N/A'}, Population: ${city.population?.toLocaleString() || 'N/A'}, Buffets: ${city.buffetCount})\n`;
    }
    if (longTail.length > 10) {
      output += `  ... and ${longTail.length - 10} more\n`;
    }
    output += '\n';
  }
  
  // Environment variables
  output += 'ENVIRONMENT VARIABLES\n';
  output += '-'.repeat(80) + '\n';
  output += `INDEXING_PHASE=${process.env.INDEXING_PHASE || 'all'}\n`;
  output += `STAGED_INDEXING_ENABLED=${process.env.STAGED_INDEXING_ENABLED || 'false'}\n\n`;
  
  output += '='.repeat(80) + '\n';
  
  return output;
}

/**
 * Run status report
 */
export async function runStatusReport(): Promise<void> {
  console.log('[Staged Indexing Status] Generating report...');
  
  try {
    const report = await generateStatusReport();
    console.log(report);
    
    // Save to file
    const fs = require('fs');
    const path = require('path');
    const reportPath = path.join(process.cwd(), 'staged-indexing-status.txt');
    fs.writeFileSync(reportPath, report);
    console.log(`\n[Staged Indexing Status] Report saved to: ${reportPath}`);
  } catch (error) {
    console.error('[Staged Indexing Status] Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runStatusReport();
}
