'use client';

import { useState, useId } from 'react';
import {
  buildOverallSummary,
  buildSectionSummary,
  POI_SHORT_NAMES,
  type POISectionSummary,
} from '@/lib/poiUtils';

/**
 * Convert snake_case or kebab-case to Title Case
 */
function formatCategory(category: string): string {
  return category
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

interface POIItem {
  name?: string;
  category?: string;
  addressText?: string;
  distanceText?: string;
  distanceFt?: number;
  hoursText?: string;
  phone?: string;
  website?: string;
}

interface POIGroup {
  label: string;
  items?: POIItem[];
}

interface POISection {
  summary?: string;
  highlights?: POIGroup[];
}

interface NearbyHighlightsProps {
  accommodationLodging?: POISection;
  agriculturalFarming?: POISection;
  artsCulture?: POISection;
  communicationsTechnology?: POISection;
  educationLearning?: POISection;
  financialServices?: POISection;
  foodDining?: POISection;
  governmentPublicServices?: POISection;
  healthcareMedicalServices?: POISection;
  homeImprovementGarden?: POISection;
  industrialManufacturing?: POISection;
  miscellaneousServices?: POISection;
  personalCareBeauty?: POISection;
  petCareVeterinary?: POISection;
  professionalBusinessServices?: POISection;
  recreationEntertainment?: POISection;
  religiousSpiritual?: POISection;
  repairMaintenance?: POISection;
  retailShopping?: POISection;
  socialCommunityServices?: POISection;
  sportsFitness?: POISection;
  transportationAutomotive?: POISection;
  travelTourismServices?: POISection;
  utilitiesInfrastructure?: POISection;
}

const POI_LABELS: Record<string, string> = {
  accommodationLodging: 'Accommodation & Lodging',
  agriculturalFarming: 'Agricultural & Farming',
  artsCulture: 'Arts & Culture',
  communicationsTechnology: 'Communications & Technology',
  educationLearning: 'Education & Learning',
  financialServices: 'Financial Services',
  foodDining: 'Food & Dining',
  governmentPublicServices: 'Government & Public Services',
  healthcareMedicalServices: 'Healthcare & Medical',
  homeImprovementGarden: 'Home & Garden',
  industrialManufacturing: 'Industrial & Manufacturing',
  miscellaneousServices: 'Miscellaneous Services',
  personalCareBeauty: 'Personal Care & Beauty',
  petCareVeterinary: 'Pet Care & Veterinary',
  professionalBusinessServices: 'Professional Services',
  recreationEntertainment: 'Recreation & Entertainment',
  religiousSpiritual: 'Religious & Spiritual',
  repairMaintenance: 'Repair & Maintenance',
  retailShopping: 'Retail & Shopping',
  socialCommunityServices: 'Social & Community Services',
  sportsFitness: 'Sports & Fitness',
  transportationAutomotive: 'Transportation & Automotive',
  travelTourismServices: 'Travel & Tourism',
  utilitiesInfrastructure: 'Utilities & Infrastructure',
};

function POIItemCard({ item }: { item: POIItem }) {
  return (
    <div className="bg-[var(--surface2)] rounded-lg border border-[var(--border)] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h5 className="font-semibold text-[var(--text)] mb-1">{item.name}</h5>
          {item.category && (
            <p className="text-sm text-[var(--muted)] mb-1">{formatCategory(item.category)}</p>
          )}
          {item.addressText && (
            <p className="text-sm text-[var(--muted)] mb-2">{item.addressText}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {item.distanceText && (
              <span className="inline-flex items-center gap-1 text-[var(--accent1)] font-medium">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {item.distanceText}
              </span>
            )}
            {item.hoursText && (
              <span className="inline-flex items-center gap-1 text-[var(--muted)]">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {item.hoursText}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 text-right shrink-0">
          {item.phone && (
            <a href={`tel:${item.phone}`} className="text-sm text-[var(--accent1)] hover:underline">
              {item.phone}
            </a>
          )}
          {item.website && (
            <a
              href={item.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--accent1)] hover:underline inline-flex items-center gap-1 justify-end"
            >
              Website
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function POISectionAccordion({
  section,
  defaultExpanded,
}: {
  section: POISectionSummary;
  defaultExpanded: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const baseId = useId();
  const buttonId = `${baseId}-button`;
  const regionId = `${baseId}-region`;

  return (
    <div className="border-b border-[var(--border)] last:border-b-0">
      <h3>
        <button
          id={buttonId}
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-controls={regionId}
          className="w-full text-left py-4 px-4 flex items-center gap-3 min-h-[44px] hover:bg-[var(--surface2)]/50 active:bg-[var(--surface2)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent1)] focus-visible:ring-offset-2 rounded-lg"
        >
          <div className="flex-1 min-w-0 text-left">
            <div className="font-semibold text-[var(--text)]">{section.sectionLabel}</div>
            <div className="text-sm text-[var(--muted)] mt-0.5">{buildSectionSummary(section)}</div>
          </div>
          <svg
            className={`w-5 h-5 flex-shrink-0 text-[var(--muted)] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </h3>
      <div
        id={regionId}
        role="region"
        aria-labelledby={buttonId}
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 pb-4 space-y-4">
          {section.groups.map((group, groupIndex) => (
            <div key={groupIndex}>
              <h4 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent1)]" aria-hidden />
                {group.label}
              </h4>
              <div className="space-y-3">
                {(group.items || []).map((item, itemIndex) => (
                  <POIItemCard key={itemIndex} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function NearbyHighlights(props: NearbyHighlightsProps) {
  const poiKeys = Object.keys(POI_LABELS) as Array<keyof NearbyHighlightsProps>;
  const sections: POISectionSummary[] = [];

  for (const key of poiKeys) {
    const section = props[key];
    if (!section?.highlights) continue;

    const groups: Array<{ label: string; items: POIItem[] }> = [];
    let totalPlaces = 0;

    for (const group of section.highlights) {
      if (!group.items?.length) continue;
      const filtered = group.items.filter((i) => i.name);
      if (filtered.length === 0) continue;
      groups.push({ label: group.label, items: filtered });
      totalPlaces += filtered.length;
    }

    if (groups.length > 0) {
      sections.push({
        sectionKey: key,
        sectionLabel: POI_LABELS[key],
        shortName: POI_SHORT_NAMES[key] || key.replace(/([A-Z])/g, ' $1').toLowerCase().trim(),
        totalPlaces,
        groups,
      });
    }
  }

  if (sections.length === 0) return null;

  const summaryText = buildOverallSummary(sections);

  return (
    <div className="space-y-4">
      {/* Short summary - always visible */}
      <p className="text-sm text-[var(--text-secondary)] font-medium">{summaryText}</p>

      {/* Collapsible POI sections - accordion */}
      <div className="rounded-lg border border-[var(--border)] overflow-hidden">
        {sections.map((section, index) => (
          <POISectionAccordion
            key={section.sectionKey}
            section={section}
            defaultExpanded={index === 0 && sections.length <= 3}
          />
        ))}
      </div>
    </div>
  );
}
