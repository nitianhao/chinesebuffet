import { BUFFET_TERMS, INDIAN_CUISINE_TERMS } from './constants';
import type { ClassificationStatus, SourceCandidate, StagedCandidate } from './types';
import { normalizeAddress } from './normalize/normalize-address';
import { normalizeDomain } from './normalize/normalize-domain';
import { normalizeName, slugify } from './normalize/normalize-name';
import { normalizePhone } from './normalize/normalize-phone';

function includesAnyTerm(haystack: string, terms: readonly string[]): string[] {
  const normalized = haystack.toLowerCase();
  return terms.filter((term) => normalized.includes(term));
}

export function classifyCandidate(candidate: SourceCandidate): StagedCandidate {
  const evidenceHaystack = [
    candidate.name,
    candidate.address,
    candidate.website,
    candidate.categories.join(' '),
    JSON.stringify(candidate.rawTags || {}),
  ].join(' ');

  const indianSignals = includesAnyTerm(evidenceHaystack, INDIAN_CUISINE_TERMS);
  const buffetSignals = includesAnyTerm(evidenceHaystack, BUFFET_TERMS);
  const evidence = [
    ...indianSignals.map((term) => `indian_cuisine_term:${term}`),
    ...buffetSignals.map((term) => `buffet_term:${term}`),
  ];

  let classificationStatus: ClassificationStatus = 'insufficient_evidence';
  let confidence = 0.2;

  if (indianSignals.length > 0 && buffetSignals.length > 0) {
    classificationStatus = 'likely_indian_buffet';
    confidence = 0.85;
  } else if (indianSignals.length > 0 || buffetSignals.length > 0) {
    classificationStatus = 'needs_review';
    confidence = 0.55;
  }

  const normalizedName = normalizeName(candidate.name);
  const normalizedAddress = normalizeAddress(candidate.address || candidate.street);
  const phone = normalizePhone(candidate.phone);
  const domain = normalizeDomain(candidate.website);
  const candidateKeyParts = [
    slugify(candidate.name || 'unknown'),
    candidate.stateAbbr || candidate.state || 'xx',
    normalizedAddress || `${candidate.lat || ''},${candidate.lng || ''}`,
    phone || domain,
  ].filter(Boolean);

  return {
    ...candidate,
    candidateKey: candidateKeyParts.join('|'),
    normalizedName,
    normalizedAddress,
    evidence,
    classificationStatus,
    confidence,
  };
}
