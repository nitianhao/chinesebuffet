import type { CandidateEnrichment, StagedCandidate } from '../types';
import { normalizeAddress } from '../normalize/normalize-address';
import { normalizeName } from '../normalize/normalize-name';
import { normalizePhone } from '../normalize/normalize-phone';

const NYC_DOHMH_ENDPOINT = 'https://data.cityofnewyork.us/resource/43nn-pn8j.json';

interface DohmhRow {
  camis?: string;
  dba?: string;
  boro?: string;
  building?: string;
  street?: string;
  zipcode?: string;
  phone?: string;
  cuisine_description?: string;
  inspection_date?: string;
  action?: string;
  violation_code?: string;
  violation_description?: string;
  critical_flag?: string;
  score?: string;
  grade?: string;
  grade_date?: string;
  record_date?: string;
  inspection_type?: string;
  latitude?: string;
  longitude?: string;
}

interface DohmhGroup {
  camis: string;
  rows: DohmhRow[];
  latest: DohmhRow;
}

interface ScoredMatch {
  group: DohmhGroup;
  confidence: number;
  reasons: string[];
}

function buildDohmhAddress(row: DohmhRow): string {
  return [row.building, row.street, row.boro, row.zipcode].filter(Boolean).join(', ');
}

function parseDate(value: string | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function tokenize(value: string | undefined): Set<string> {
  return new Set(
    normalizeName(value)
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length > 1)
  );
}

function jaccard(a: string | undefined, b: string | undefined): number {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (!aTokens.size || !bTokens.size) return 0;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }

  return intersection / new Set([...aTokens, ...bTokens]).size;
}

function groupRows(rows: DohmhRow[]): DohmhGroup[] {
  const byCamis = new Map<string, DohmhRow[]>();
  for (const row of rows) {
    if (!row.camis) continue;
    if (!byCamis.has(row.camis)) byCamis.set(row.camis, []);
    byCamis.get(row.camis)?.push(row);
  }

  return Array.from(byCamis.entries()).map(([camis, groupRowsForCamis]) => {
    const sorted = [...groupRowsForCamis].sort((a, b) => parseDate(b.inspection_date) - parseDate(a.inspection_date));
    return {
      camis,
      rows: groupRowsForCamis,
      latest: sorted[0],
    };
  });
}

function scoreCandidate(candidate: StagedCandidate, group: DohmhGroup): ScoredMatch {
  const latest = group.latest;
  const reasons: string[] = [];
  let score = 0;

  const nameSimilarity = jaccard(candidate.name, latest.dba);
  if (nameSimilarity >= 0.85) {
    score += 0.55;
    reasons.push(`strong_name:${nameSimilarity.toFixed(2)}`);
  } else if (nameSimilarity >= 0.55) {
    score += 0.35;
    reasons.push(`medium_name:${nameSimilarity.toFixed(2)}`);
  } else if (nameSimilarity >= 0.35) {
    score += 0.2;
    reasons.push(`weak_name:${nameSimilarity.toFixed(2)}`);
  }

  if (candidate.postalCode && latest.zipcode && candidate.postalCode === latest.zipcode) {
    score += 0.2;
    reasons.push('zip_match');
  }

  const candidatePhone = normalizePhone(candidate.phone);
  const dohmhPhone = normalizePhone(latest.phone);
  if (candidatePhone && dohmhPhone && candidatePhone === dohmhPhone) {
    score += 0.25;
    reasons.push('phone_match');
  }

  const candidateAddress = normalizeAddress(candidate.street || candidate.address);
  const dohmhAddress = normalizeAddress([latest.building, latest.street].filter(Boolean).join(' '));
  if (candidateAddress && dohmhAddress && candidateAddress.includes(dohmhAddress)) {
    score += 0.2;
    reasons.push('street_match');
  }

  if (latest.cuisine_description?.toLowerCase() === 'indian') {
    score += 0.05;
    reasons.push('cuisine_indian');
  }

  return {
    group,
    confidence: Math.min(1, Number(score.toFixed(3))),
    reasons,
  };
}

function countViolations(rows: DohmhRow[], latestInspectionDate: string | undefined): {
  critical: number;
  general: number;
  violations: NonNullable<CandidateEnrichment['healthInspection']>['violations'];
} {
  const latestRows = rows.filter((row) => row.inspection_date === latestInspectionDate);
  const violations = latestRows
    .filter((row) => row.violation_description)
    .map((row) => ({
      code: row.violation_code,
      description: row.violation_description || '',
      category: row.critical_flag === 'Critical' ? 'Critical' as const : 'General' as const,
    }));

  return {
    critical: violations.filter((violation) => violation.category === 'Critical').length,
    general: violations.filter((violation) => violation.category === 'General').length,
    violations,
  };
}

function buildInspectionHistory(rows: DohmhRow[]): NonNullable<CandidateEnrichment['healthInspection']>['inspectionHistory'] {
  const byDate = new Map<string, DohmhRow[]>();
  for (const row of rows) {
    if (!row.inspection_date) continue;
    if (!byDate.has(row.inspection_date)) byDate.set(row.inspection_date, []);
    byDate.get(row.inspection_date)?.push(row);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => parseDate(b) - parseDate(a))
    .slice(0, 10)
    .map(([date, dateRows]) => {
      const critical = dateRows.filter((row) => row.critical_flag === 'Critical' && row.violation_description).length;
      const violationsCount = dateRows.filter((row) => row.violation_description).length;
      const first = dateRows[0];
      return {
        date,
        score: first.score,
        grade: first.grade,
        violationsCount,
        criticalViolationsCount: critical,
      };
    });
}

function buildHealthInspection(match: ScoredMatch): NonNullable<CandidateEnrichment['healthInspection']> {
  const { group, confidence, reasons } = match;
  const latest = group.latest;
  const violationCounts = countViolations(group.rows, latest.inspection_date);

  return {
    source: 'nyc_dohmh',
    matchConfidence: confidence,
    matchReasons: reasons,
    camis: group.camis,
    dba: latest.dba || '',
    boro: latest.boro,
    cuisineDescription: latest.cuisine_description,
    address: buildDohmhAddress(latest),
    phone: latest.phone,
    currentGrade: latest.grade,
    currentScore: latest.score,
    inspectionDate: latest.inspection_date,
    gradeDate: latest.grade_date,
    violations: violationCounts.violations,
    criticalViolationsCount: violationCounts.critical,
    generalViolationsCount: violationCounts.general,
    inspectionHistory: buildInspectionHistory(group.rows),
    dataSource: 'NYC DOHMH Restaurant Inspection Results',
    lastUpdated: latest.record_date,
    permitNumber: group.camis,
    healthDepartmentUrl: 'https://data.cityofnewyork.us/Health/DOHMH-New-York-City-Restaurant-Inspection-Results/43nn-pn8j',
    rawLatestInspection: latest as Record<string, unknown>,
  };
}

export async function fetchNycIndianInspectionGroups(): Promise<DohmhGroup[]> {
  const params = new URLSearchParams({
    cuisine_description: 'Indian',
    '$limit': '50000',
    '$order': 'inspection_date DESC',
  });
  const response = await fetch(`${NYC_DOHMH_ENDPOINT}?${params}`, {
    headers: { 'User-Agent': 'BuffetLocator Indian restaurant staging enrichment' },
  });

  if (!response.ok) {
    throw new Error(`NYC DOHMH request failed: ${response.status} ${response.statusText}`);
  }

  const rows = (await response.json()) as DohmhRow[];
  return groupRows(rows);
}

export function enrichCandidatesWithNycDohmh(
  candidates: StagedCandidate[],
  groups: DohmhGroup[],
  minimumConfidence = 0.65
): StagedCandidate[] {
  return candidates.map((candidate) => {
    const best = groups
      .map((group) => scoreCandidate(candidate, group))
      .sort((a, b) => b.confidence - a.confidence)[0];

    if (!best || best.confidence < minimumConfidence) return candidate;

    return {
      ...candidate,
      enrichment: {
        ...candidate.enrichment,
        healthInspection: buildHealthInspection(best),
      },
    };
  });
}
