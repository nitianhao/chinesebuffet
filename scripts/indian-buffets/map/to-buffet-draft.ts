import type { StagedCandidate } from '../types';
import { normalizePhone } from '../normalize/normalize-phone';
import { slugify } from '../normalize/normalize-name';

export interface BuffetDraft {
  name: string;
  searchName: string;
  slug: string;
  street: string;
  cityName: string;
  state: string;
  stateAbbr: string;
  postalCode: string;
  address: string;
  phone?: string;
  phoneUnformatted?: string;
  website?: string;
  rating?: number;
  reviewsCount?: number;
  price?: string;
  lat: number;
  lng: number;
  permanentlyClosed: boolean;
  temporarilyClosed: boolean;
  placeId: string;
  categoryName?: string;
  primaryType: string;
  categories?: string;
  hours?: string;
  rawOpeningHours?: string;
  serviceOptions?: string;
  menu?: string;
  webResults?: string;
  description?: string;
  description2?: string;
  countryCode?: string;
  images?: string;
  imagesCount?: number;
  imageCategories?: string;
  healthInspection?: string;
  overpassPOIs?: string;
  accommodationLodging?: string;
  artsCulture?: string;
  communicationsTechnology?: string;
  educationLearning?: string;
  financialServices?: string;
  foodDining?: string;
  governmentPublicServices?: string;
  healthcareMedicalServices?: string;
  homeImprovementGarden?: string;
  miscellaneousServices?: string;
  personalCareBeauty?: string;
  petCareVeterinary?: string;
  professionalBusinessServices?: string;
  recreationEntertainment?: string;
  religiousSpiritual?: string;
  repairMaintenance?: string;
  retailShopping?: string;
  sportsFitness?: string;
  transportationAutomotive?: string;
  travelTourismServices?: string;
  utilitiesInfrastructure?: string;
  scrapedAt: string;
}

export interface StructuredDataDraft {
  type: string;
  group: string;
  data: string;
  createdAt: string;
  updatedAt: string;
}

export interface BuffetDraftBundle {
  candidateKey: string;
  buffet: BuffetDraft;
  structuredDataDrafts: StructuredDataDraft[];
}

function compactObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (item === undefined || item === null) return false;
      if (typeof item === 'string') return item.trim().length > 0;
      if (Array.isArray(item)) return item.length > 0;
      if (typeof item === 'object') return Object.keys(item).length > 0;
      return true;
    })
  ) as Partial<T>;
}

function buildAddress(candidate: StagedCandidate): string {
  return (
    candidate.address ||
    [candidate.street, candidate.cityName, candidate.stateAbbr || candidate.state, candidate.postalCode]
      .filter(Boolean)
      .join(', ')
  );
}

function buildServiceOptions(candidate: StagedCandidate): string | undefined {
  const osm = candidate.enrichment?.osm;
  if (!osm) return undefined;

  const serviceOptions = compactObject({
    takeout: osm.takeaway === 'yes' ? true : osm.takeaway === 'no' ? false : undefined,
    delivery: osm.delivery === 'yes' ? true : osm.delivery === 'no' ? false : undefined,
    dineIn: true,
    outdoorSeating: osm.outdoorSeating === 'yes' ? true : osm.outdoorSeating === 'no' ? false : undefined,
    wheelchairAccessible: osm.wheelchair === 'yes' ? true : osm.wheelchair === 'no' ? false : undefined,
    creditCards: osm.paymentMethods?.includes('credit_cards') ? true : undefined,
    vegetarianOptions: osm.diet?.includes('vegetarian') ? true : undefined,
    veganOptions: osm.diet?.includes('vegan') ? true : undefined,
    halalOptions: osm.diet?.includes('halal') ? true : undefined,
    kosherOptions: osm.diet?.includes('kosher') ? true : undefined,
  });

  return Object.keys(serviceOptions).length ? JSON.stringify(serviceOptions) : undefined;
}

function buildMenu(candidate: StagedCandidate): string | undefined {
  const website = candidate.enrichment?.website;
  if (!website) return undefined;

  const menu = compactObject({
    source: 'official_website',
    sourceUrl: website.menuUrls?.[0],
    menuUrl: website.menuUrls?.[0],
    menuUrls: website.menuUrls,
    menuSnippets: website.menuSnippets,
    buffetSnippets: website.buffetSnippets,
    extractedAt: new Date().toISOString(),
  });

  return Object.keys(menu).length ? JSON.stringify(menu) : undefined;
}

function buildWebResults(candidate: StagedCandidate): string | undefined {
  const website = candidate.enrichment?.website;
  const overture = candidate.enrichment?.overture;
  if (!candidate.website && !website?.crawledUrls?.length && !overture?.websites?.length && !overture?.socials?.length) return undefined;

  const officialUrls = (website?.crawledUrls?.length ? website.crawledUrls : [candidate.website, ...(overture?.websites || [])])
    .filter((url): url is string => Boolean(url))
    .map((url, index) =>
      compactObject({
        title: website?.titles?.[index] || candidate.name,
        url,
        displayedUrl: url.replace(/^https?:\/\//, ''),
        description: website?.menuSnippets?.[index] || website?.hoursSnippets?.[index],
        source: 'official_website',
      })
    );
  const socialUrls = (overture?.socials || []).map((url) =>
    compactObject({
      title: `${candidate.name} social profile`,
      url,
      displayedUrl: url.replace(/^https?:\/\//, ''),
      source: 'overture_social',
    })
  );
  const results = [...officialUrls, ...socialUrls];

  return results.length ? JSON.stringify(results) : undefined;
}

function buildDescription(candidate: StagedCandidate): string | undefined {
  const website = candidate.enrichment?.website;
  const snippets = [
    ...(website?.menuSnippets || []),
    ...(website?.hoursSnippets || []),
    ...(website?.buffetSnippets || []),
  ];

  return snippets[0]?.slice(0, 500);
}

function buildHours(candidate: StagedCandidate): string | undefined {
  const rawOpeningHours = candidate.enrichment?.osm?.openingHours;
  if (!rawOpeningHours) return undefined;

  return JSON.stringify([
    {
      day: 'Raw OSM',
      hours: rawOpeningHours,
    },
  ]);
}

function buildHealthInspection(candidate: StagedCandidate): string | undefined {
  const healthInspection = candidate.enrichment?.healthInspection;
  if (!healthInspection) return undefined;

  return JSON.stringify({
    currentScore: healthInspection.currentScore,
    currentGrade: healthInspection.currentGrade,
    inspectionDate: healthInspection.inspectionDate,
    violations: healthInspection.violations,
    criticalViolationsCount: healthInspection.criticalViolationsCount,
    generalViolationsCount: healthInspection.generalViolationsCount,
    inspectionHistory: healthInspection.inspectionHistory,
    dataSource: healthInspection.dataSource,
    lastUpdated: healthInspection.lastUpdated,
    permitNumber: healthInspection.permitNumber,
    healthDepartmentUrl: healthInspection.healthDepartmentUrl,
    matchConfidence: healthInspection.matchConfidence,
    matchReasons: healthInspection.matchReasons,
  });
}

export function buildStructuredDataDrafts(candidate: StagedCandidate): StructuredDataDraft[] {
  const now = new Date().toISOString();
  const drafts: StructuredDataDraft[] = [];
  const overture = candidate.enrichment?.overture;
  const healthInspection = candidate.enrichment?.healthInspection;

  if (overture?.emails?.length || overture?.socials?.length || overture?.brand) {
    drafts.push({
      type: 'externalContact',
      group: 'Contact',
      data: JSON.stringify(compactObject({
        emails: overture.emails,
        socials: overture.socials,
        brand: overture.brand,
        source: 'overture',
      })),
      createdAt: now,
      updatedAt: now,
    });
  }

  if (overture?.sourceSummary || overture?.sources?.length) {
    drafts.push({
      type: 'sourceProvenance',
      group: 'Data Sources',
      data: JSON.stringify(compactObject({
        overtureId: overture.id,
        matchConfidence: overture.matchConfidence,
        matchReasons: overture.matchReasons,
        operatingStatus: overture.operatingStatus,
        confidence: overture.confidence,
        sourceSummary: overture.sourceSummary,
        sources: overture.sources,
      })),
      createdAt: now,
      updatedAt: now,
    });
  }

  if (healthInspection) {
    drafts.push({
      type: 'healthInspection',
      group: 'Health Inspection',
      data: JSON.stringify(healthInspection),
      createdAt: now,
      updatedAt: now,
    });
  }

  return drafts;
}

export function mapStagedCandidateToBuffetDraft(candidate: StagedCandidate): BuffetDraft {
  const phoneUnformatted = normalizePhone(candidate.phone);
  const categories = Array.from(
    new Set([
      ...(candidate.categories || []),
      candidate.enrichment?.osm?.cuisine,
      candidate.enrichment?.overture?.categoryPrimary,
      candidate.enrichment?.overture?.taxonomyPrimary,
    ].filter((value): value is string => Boolean(value)))
  );
  const stateAbbr = candidate.stateAbbr || candidate.state || '';
  const address = buildAddress(candidate);
  const rawOpeningHours = candidate.enrichment?.osm?.openingHours;

  return compactObject({
    name: candidate.name,
    searchName: candidate.normalizedName,
    slug: slugify(`${candidate.name}-${stateAbbr || candidate.cityName || 'restaurant'}`),
    street: candidate.street || '',
    cityName: candidate.cityName || '',
    state: candidate.state || stateAbbr,
    stateAbbr,
    postalCode: candidate.postalCode || '',
    address,
    phone: candidate.phone,
    phoneUnformatted,
    website: candidate.website,
    countryCode: 'US',
    lat: Number(candidate.lat) || 0,
    lng: Number(candidate.lng) || 0,
    permanentlyClosed: false,
    temporarilyClosed: false,
    placeId: candidate.sourceId,
    categoryName: categories[0],
    primaryType: candidate.source === 'overpass' ? 'osm_restaurant' : `${candidate.source}_restaurant`,
    categories: categories.length ? JSON.stringify(categories) : undefined,
    hours: buildHours(candidate),
    rawOpeningHours,
    serviceOptions: buildServiceOptions(candidate),
    menu: buildMenu(candidate),
    webResults: buildWebResults(candidate),
    description: buildDescription(candidate),
    description2: buildDescription(candidate),
    healthInspection: buildHealthInspection(candidate),
    scrapedAt: new Date().toISOString(),
  }) as BuffetDraft;
}

export function mapStagedCandidateToBuffetDraftBundle(candidate: StagedCandidate): BuffetDraftBundle {
  return {
    candidateKey: candidate.candidateKey,
    buffet: mapStagedCandidateToBuffetDraft(candidate),
    structuredDataDrafts: buildStructuredDataDrafts(candidate),
  };
}
