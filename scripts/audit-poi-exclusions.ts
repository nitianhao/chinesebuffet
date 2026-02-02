/**
 * POI Page Exclusion Audit Script
 * 
 * Audits all POI pages and reports which ones are excluded from indexing
 * and why. Useful for monitoring and optimization.
 */

import { getAllCitySlugs } from '@/lib/data-instantdb';
import {
  getBuffetsWithParking,
  getBuffetsNearShoppingMalls,
  getBuffetsNearHighways,
  getBuffetsNearGasStations,
} from '@/lib/data-instantdb';
import { assessPOIPageQuality, getExclusionReasonDescription } from '@/lib/poi-page-quality';

const POI_TYPES = {
  parking: {
    title: 'Chinese Buffets with Parking',
    description: 'Find Chinese buffets with convenient parking nearby. Perfect for families and groups who need easy access.',
    metaDescription: 'Discover Chinese buffets with parking available nearby. Browse locations with convenient parking options for easy access.',
    fetchFunction: getBuffetsWithParking,
  },
  'shopping-malls': {
    title: 'Chinese Buffets Near Shopping Malls',
    description: 'Chinese buffets conveniently located near shopping malls and retail centers. Great for combining shopping with dining.',
    metaDescription: 'Find Chinese buffets near shopping malls and retail centers. Perfect locations for combining shopping trips with buffet dining.',
    fetchFunction: getBuffetsNearShoppingMalls,
  },
  highways: {
    title: 'Chinese Buffets Near Highways',
    description: 'Chinese buffets located near major highways and freeways. Ideal for travelers and road trips.',
    metaDescription: 'Discover Chinese buffets near major highways and freeways. Convenient locations for travelers and road trip dining.',
    fetchFunction: getBuffetsNearHighways,
  },
  'gas-stations': {
    title: 'Chinese Buffets Near Gas Stations',
    description: 'Chinese buffets conveniently located near gas stations. Perfect for refueling and refueling yourself.',
    metaDescription: 'Find Chinese buffets near gas stations. Convenient locations for combining fuel stops with buffet dining.',
    fetchFunction: getBuffetsNearGasStations,
  },
} as const;

type POIType = keyof typeof POI_TYPES;

interface ExclusionReport {
  poiType: string;
  pagePath: string;
  indexable: boolean;
  reason: string | null;
  reasonCode: string;
  metrics: {
    buffetCount: number;
    contentLength: number;
    intentClear: boolean;
  };
  thresholds: {
    buffetCountThreshold: number;
    contentLengthThreshold: number;
    hasClearIntent: boolean;
  };
}

/**
 * Audit all POI pages
 */
export async function auditPOIExclusions(): Promise<{
  total: number;
  indexable: number;
  excluded: number;
  exclusions: ExclusionReport[];
  byReason: Record<string, number>;
}> {
  const exclusions: ExclusionReport[] = [];
  const byReason: Record<string, number> = {};

  for (const [poiType, config] of Object.entries(POI_TYPES)) {
    try {
      // Fetch buffets for this POI type
      const buffets = await config.fetchFunction(100);
      const buffetCount = buffets.length;

      // Additional content
      const additionalContent = config.description || '';

      // Assess quality
      const qualityResult = assessPOIPageQuality(
        poiType,
        buffetCount,
        config.title,
        config.description,
        config.metaDescription,
        additionalContent,
        5, // Buffet count threshold
        200 // Content length threshold
      );

      const pagePath = `/chinese-buffets/near/${poiType}`;

      exclusions.push({
        poiType,
        pagePath,
        indexable: qualityResult.indexable,
        reason: qualityResult.reason,
        reasonCode: qualityResult.reasonCode,
        metrics: {
          buffetCount: qualityResult.buffetCount,
          contentLength: qualityResult.contentLength,
          intentClear: qualityResult.intentClear,
        },
        thresholds: qualityResult.details,
      });

      // Count by reason
      if (!qualityResult.indexable && qualityResult.reason) {
        byReason[qualityResult.reason] = (byReason[qualityResult.reason] || 0) + 1;
      }
    } catch (error) {
      console.error(`Error auditing POI type ${poiType}:`, error);
    }
  }

  const indexable = exclusions.filter(e => e.indexable).length;
  const excluded = exclusions.filter(e => !e.indexable).length;

  return {
    total: exclusions.length,
    indexable,
    excluded,
    exclusions,
    byReason,
  };
}

/**
 * Generate human-readable report
 */
export function generateExclusionReport(report: Awaited<ReturnType<typeof auditPOIExclusions>>): string {
  let output = '\n=== POI Page Exclusion Audit Report ===\n\n';
  
  output += `Total POI Pages: ${report.total}\n`;
  output += `Indexable: ${report.indexable}\n`;
  output += `Excluded: ${report.excluded}\n\n`;

  if (report.excluded > 0) {
    output += 'Exclusion Reasons:\n';
    for (const [reason, count] of Object.entries(report.byReason)) {
      output += `  ${reason}: ${count}\n`;
    }
    output += '\n';

    output += 'Excluded Pages:\n';
    for (const exclusion of report.exclusions.filter(e => !e.indexable)) {
      output += `\n  ${exclusion.pagePath}\n`;
      output += `    Reason: ${exclusion.reason || 'Unknown'}\n`;
      output += `    Reason Code: ${exclusion.reasonCode}\n`;
      if (exclusion.reason) {
        output += `    Description: ${getExclusionReasonDescription(exclusion.reason as any)}\n`;
      }
      output += `    Buffet Count: ${exclusion.metrics.buffetCount}\n`;
      output += `    Content Length: ${exclusion.metrics.contentLength}\n`;
      output += `    Intent Clear: ${exclusion.metrics.intentClear}\n`;
    }
  } else {
    output += '✅ All POI pages are indexable!\n';
  }

  return output;
}

/**
 * Run audit and print report
 */
export async function runAudit(): Promise<void> {
  console.log('[POI Exclusion Audit] Starting audit...');
  
  const report = await auditPOIExclusions();
  const reportText = generateExclusionReport(report);
  
  console.log(reportText);
  
  // Save to file if needed
  if (process.env.NODE_ENV === 'development') {
    const fs = require('fs');
    const path = require('path');
    const reportPath = path.join(process.cwd(), 'poi-exclusion-audit.txt');
    fs.writeFileSync(reportPath, reportText);
    console.log(`\n[POI Exclusion Audit] Report saved to: ${reportPath}`);
  }
}

// Run if called directly
if (require.main === module) {
  runAudit().catch((error) => {
    console.error('[POI Exclusion Audit] Fatal error:', error);
    process.exit(1);
  });
}
