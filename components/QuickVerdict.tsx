import React from 'react';

interface QuickVerdictProps {
  buffet: {
    rating?: number | null;
    reviewsCount?: number | null;
    price?: string | null;
    reviews?: Array<{ text?: string; textTranslated?: string }>;
    reviewsTags?: Array<{ title: string; count?: number }>;
    amenities?: Record<string, any>;
    accessibility?: Record<string, any>;
    hours?: { popularTimesHistogram?: Record<string, Array<{ hour: number; occupancyPercent: number }>> };
  };
  precomputedAdditionalInfo?: Record<string, any> | null;
}

type Bullet = { text: string; type: 'positive' | 'caution' };

function checkAvailability(data: any, keywords: string[]): boolean {
  if (!data) return false;
  const check = (v: any): boolean => {
    if (typeof v === 'string') return keywords.some(k => v.toLowerCase().includes(k));
    if (v === true || v === 'true' || v === 'yes') return true;
    if (Array.isArray(v)) return v.some(check);
    if (typeof v === 'object' && v !== null) return Object.values(v).some(check);
    return false;
  };
  return Array.isArray(data) ? data.some(check) : check(data);
}

function getServiceOptions(data: any): string[] {
  if (!data) return [];
  const opts: string[] = [];
  const flatten = (obj: any, prefix: string[] = []): void => {
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v === true || v === 'true' || v === 'yes') opts.push([...prefix, k].join(' '));
      else if (typeof v === 'object' && v !== null && !Array.isArray(v)) flatten(v, [...prefix, k]);
    });
  };
  if (Array.isArray(data)) data.forEach((x: any) => typeof x === 'string' && opts.push(x));
  else flatten(data);
  return opts;
}

function hasPeakCrowding(histogram: Record<string, Array<{ hour: number; occupancyPercent: number }>> | undefined): boolean {
  if (!histogram || typeof histogram !== 'object') return false;
  let peakCount = 0;
  Object.values(histogram).forEach((day: any) => {
    if (Array.isArray(day)) {
      day.forEach((e: any) => {
        if (e?.occupancyPercent >= 60) peakCount++;
      });
    }
  });
  return peakCount >= 3; // At least 3 high-occupancy slots across the week
}

export default function QuickVerdict({ buffet, precomputedAdditionalInfo }: QuickVerdictProps) {
  const bullets: Bullet[] = [];
  const rating = buffet.rating ?? 0;
  const reviewsCount = buffet.reviewsCount ?? 0;
  const price = buffet.price || '';
  const reviews = buffet.reviews || [];
  const reviewsTags = buffet.reviewsTags || [];
  const amenities = buffet.amenities || {};
  const additionalInfo = precomputedAdditionalInfo || (buffet as any).additionalInfo || {};
  const serviceOpts = getServiceOptions(amenities['service options'] || additionalInfo?.['Service options']);
  const planning = amenities.planning || additionalInfo?.Planning;
  const accessibility = buffet.accessibility || additionalInfo?.Accessibility;
  const amenityList = amenities?.amenities || additionalInfo?.Amenities;

  // Tag titles (lowercase) for matching
  const tagTitles = reviewsTags.map(t => (t.title || '').toLowerCase());

  // Review text for keyword checks
  const reviewText = reviews
    .slice(0, 20)
    .map(r => (r.textTranslated || r.text || '').toLowerCase())
    .join(' ');

  // --- Positive bullets (✔) ---

  // Variety - from reviewsTags or reviews
  if (tagTitles.some(t => /variety|selection|choices|options/.test(t))) {
    bullets.push({ text: 'Popular for large variety', type: 'positive' });
  } else if (reviewText.includes('variety') || reviewText.includes('selection')) {
    bullets.push({ text: 'Reviewers mention good variety', type: 'positive' });
  }

  // Family-friendly - from amenities or reviews
  const hasHighChairs = checkAvailability(amenities, ['high chair', 'highchair', 'kids']);
  const hasFamilyAmenity = checkAvailability(amenityList, ['high chair', 'kids', 'family']);
  const hasFamilyMentions = /family|kids|children|kid-friendly/.test(reviewText);
  if (hasHighChairs || hasFamilyAmenity) {
    bullets.push({ text: 'Family-friendly seating', type: 'positive' });
  } else if (hasFamilyMentions) {
    bullets.push({ text: 'Reviewers mention family-friendly', type: 'positive' });
  }

  // Value - from price or reviews
  const dollarCount = (price.match(/\$/g) || []).length;
  const hasValueMentions = /value|affordable|worth|budget|cheap/.test(reviewText);
  if (dollarCount <= 2 && (hasValueMentions || reviewsCount >= 20)) {
    bullets.push({ text: 'Good value for price', type: 'positive' });
  } else if (rating >= 4.0 && reviewsCount >= 20) {
    bullets.push({ text: 'Consistently well-rated', type: 'positive' });
  }

  // Dine-in / service options
  if (serviceOpts.some(s => /dine-in|dining/i.test(s))) {
    bullets.push({ text: 'Dine-in available', type: 'positive' });
  }
  if (checkAvailability(planning, ['reservation', 'reservable', 'reserve'])) {
    bullets.push({ text: 'Accepts reservations', type: 'positive' });
  }

  // Wheelchair accessible
  if (checkAvailability(accessibility, ['wheelchair', 'accessible'])) {
    bullets.push({ text: 'Wheelchair accessible', type: 'positive' });
  }

  // Strong rating (only if we have enough data)
  if (rating >= 4.5 && reviewsCount >= 50 && !bullets.some(b => b.text.includes('well-rated'))) {
    bullets.push({ text: 'Highly rated by diners', type: 'positive' });
  }

  // Fallback: minimal data - only add if we have nothing else
  if (bullets.length === 0 && reviewsCount >= 10) {
    bullets.push({ text: 'Reviewed by diners', type: 'positive' });
  }

  // --- Caution bullets (⚠) ---

  if (hasPeakCrowding(buffet.hours?.popularTimesHistogram)) {
    bullets.push({ text: 'Can get crowded during peak hours', type: 'caution' });
  }

  // Dedupe and limit to 5 (max 1 caution)
  const seen = new Set<string>();
  const result: Bullet[] = [];
  for (const b of bullets) {
    if (result.length >= 5) break;
    const key = b.text.toLowerCase();
    if (seen.has(key)) continue;
    if (b.type === 'caution' && result.some(x => x.type === 'caution')) continue;
    seen.add(key);
    result.push(b);
  }

  if (result.length === 0) return null;

  const CheckIcon = () => (
    <svg className="w-4 h-4 flex-shrink-0 text-emerald-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  );
  const CautionIcon = () => (
    <svg className="w-4 h-4 flex-shrink-0 text-amber-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  );

  return (
    <div className="rounded-xl border-2 border-amber-200/80 bg-amber-50/90 dark:bg-amber-950/30 dark:border-amber-700/50 px-4 py-3 mb-4 shadow-sm">
      <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-2.5 uppercase tracking-wide">
        Quick verdict
      </h2>
      <ul className="space-y-1.5">
        {result.map((bullet, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            {bullet.type === 'positive' ? <CheckIcon /> : <CautionIcon />}
            <span className={bullet.type === 'caution' ? 'text-amber-900 dark:text-amber-100' : 'text-[var(--text)]'}>
              {bullet.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
