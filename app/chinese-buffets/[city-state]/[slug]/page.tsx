import React, { Suspense, type ReactNode } from 'react';
import { cache } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getCachedBuffet,
  getCityBySlug,
  getMenuForBuffet,
} from '@/lib/data-instantdb';
import { getCachedPageTransforms, computeTransforms } from '@/lib/buffet-page-transforms';

/** In-request memoization: dedupe city fetch */
const getCachedCity = cache(getCityBySlug);
/** In-request memoization: dedupe menu fetch */
const getCachedMenu = cache(getMenuForBuffet);
import Menu from '@/components/Menu';
import { computeBuffetPageQuality } from '@/lib/pageQuality';
import { createIndexTierConfig, toMetadataRobots } from '@/lib/index-tier';
import { enforceBuffetIndexingRules } from '@/lib/buffet-indexing-rules';
import { formatAddress, getStateName } from '@/lib/utils';
import Accessibility from '@/components/Accessibility';
import Amenities from '@/components/Amenities';
import Atmosphere from '@/components/Atmosphere';
import FoodOptions from '@/components/FoodOptions';
import Parking from '@/components/Parking';
import Payment from '@/components/Payment';
import ServiceOptionsSection from '@/components/ServiceOptionsSection';
import FoodAndDrink from '@/components/FoodAndDrink';
import Highlights from '@/components/Highlights';
import Planning from '@/components/Planning';
import BuffetSummaryPanel from '@/components/BuffetSummaryPanel';
import SeoJsonLd from '@/components/SeoJsonLd';
import VerdictModule from '@/components/VerdictModule';
import BestForSection from '@/components/BestForSection';
import QuickFacts from '@/components/QuickFacts';
import PageContainer from '@/components/ui/PageContainer';
import SectionCard from '@/components/ui/SectionCard';
import Chip from '@/components/ui/Chip';
import StatRow, { StatItem } from '@/components/ui/StatRow';
import Accordion from '@/components/ui/Accordion';
import KeyValueList from '@/components/ui/KeyValueList';
import InlineMeter from '@/components/ui/InlineMeter';
import ShowMore from '@/components/ui/ShowMore';
import JumpToNav from '@/components/ui/JumpToNav';
import SignatureCard from '@/components/ui/SignatureCard';
import PillChip from '@/components/ui/PillChip';
import IconLabel from '@/components/ui/IconLabel';
import ActionButton from '@/components/ui/ActionButton';
import SectionDivider from '@/components/ui/SectionDivider';
import { generateModifierTexts } from '@/components/NaturalModifiers';
import AttributesSummary from '@/components/AttributesSummary';
import BestTimeToVisit from '@/components/BestTimeToVisit';
import ComparisonContext from '@/components/ComparisonContext';
import BuffetLocationMap from '@/components/BuffetLocationMap';
import AboveTheFold from '@/components/AboveTheFold';
import BuffetHeroHeader from '@/components/BuffetHeroHeader';
import QuickVerdict from '@/components/QuickVerdict';
import NearbyHighlights from '@/components/NearbyHighlights';
import BuffetComparisonGrid from '@/components/BuffetComparisonGrid';
import InternalLinkingBlocks from '@/components/InternalLinkingBlocks';
import CityStateHubLinks from '@/components/CityStateHubLinks';
import AnswerEngineQA from '@/components/AnswerEngineQA';
import ModifierVariants from '@/components/ModifierVariants';
import DeferredReviews from '@/components/DeferredReviews';
import ReviewsBundle from '@/components/bundles/ReviewsBundle';
import POIBundle from '@/components/bundles/POIBundle';
import ComparisonBundle from '@/components/bundles/ComparisonBundle';
import SEOContentBundle from '@/components/bundles/SEOContentBundle';
import Breadcrumb from '@/components/Breadcrumb';
import MobileActionBar from '@/components/MobileActionBar';
import StreamableSection from '@/components/StreamableSection';
import SectionFallback from '@/components/SectionFallback';
import PageSection from '@/components/ui/PageSection';

import { perfReset, perfStart, perfSummary } from '@/lib/perf-logger';

// Page type and index tier declaration
const PAGE_TYPE = 'buffet' as const;
const INDEX_TIER = 'tier-2' as const;

/** ISR: cache page output, revalidate every 24h. On-demand: first request generates & caches. */
export const revalidate = 86400; // 24 hours

interface BuffetPageProps {
  params: {
    'city-state': string;
    slug: string;
  };
}

/**
 * Generate a concise, quotable description for answer engines
 */
function generateMetaDescription(buffet: any): string {
  const parts: string[] = [];
  
  // Start with type and location
  const location = buffet.cityName && buffet.state 
    ? `in ${buffet.cityName}, ${buffet.state}` 
    : '';
  parts.push(`${buffet.name} is a Chinese buffet${location ? ' ' + location : ''}`);
  
  // Add rating if available
  if (buffet.rating && buffet.reviewsCount) {
    parts.push(`Rated ${buffet.rating.toFixed(1)} stars (${buffet.reviewsCount} reviews)`);
  }
  
  // Add price if available
  if (buffet.price) {
    const dollarCount = (buffet.price.match(/\$/g) || []).length;
    const priceDesc = dollarCount === 1 ? 'Budget-friendly' : 
                      dollarCount === 2 ? 'Moderately priced' : 
                      dollarCount >= 3 ? 'Higher-priced' : '';
    if (priceDesc) {
      parts.push(priceDesc);
    }
  }
  
  return parts.join('. ') + '.';
}

export async function generateMetadata({ params }: BuffetPageProps): Promise<Metadata> {
  const buffet = await getCachedBuffet(params['city-state'], params.slug);
  
  if (!buffet) {
    return {
      title: 'Buffet Not Found',
    };
  }

  // Get base URL from environment variable
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
  
  // Build canonical URL (strip query params, ensure no trailing slash)
  const canonicalPath = `/chinese-buffets/${params['city-state']}/${params.slug}`;
  const canonicalUrl = `${baseUrl.replace(/\/$/, '')}${canonicalPath}`;
  
  // Compute page quality (for logging/debugging, but NOT for indexing decision)
  const quality = computeBuffetPageQuality(buffet);
  
  // In development, log the quality reasons for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Page Quality] ${buffet.name}:`, {
      indexable: quality.indexable,
      score: quality.score,
      reasons: quality.reasons,
    });
  }

  // Validate and create index tier configuration
  // NOTE: Buffet pages ALWAYS index, follow (enforced by buffet-indexing-rules)
  const pagePath = `/chinese-buffets/${params['city-state']}/${params.slug}`;
  const indexTierConfig = createIndexTierConfig(
    PAGE_TYPE,
    INDEX_TIER,
    true, // Buffet pages ALWAYS index (enforced by indexing rules)
    pagePath
  );

  // Generate quotable description for answer engines
  const description = generateMetaDescription(buffet);

  const metadata = {
    title: `${buffet.name} - Chinese Buffet${buffet.cityName ? ` in ${buffet.cityName}` : ''}`,
    description,
    // Canonical URL - always present, points to clean URL without query params
    alternates: {
      canonical: canonicalUrl,
    },
    // OpenGraph URL matches canonical
    openGraph: {
      url: canonicalUrl,
    },
    // Twitter URL matches canonical (if using Twitter cards)
    twitter: {
      card: 'summary_large_image',
    },
    // Robots directive: ALWAYS index, follow for buffet pages
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
      },
    },
  };

  // Enforce buffet indexing rules - throws error if validation fails
  enforceBuffetIndexingRules(metadata, pagePath, baseUrl);

  return metadata;
}

// Helper function to render text with **bold** markers converted to <strong> tags
function renderBoldText(text: string): ReactNode {
  if (!text) return null;
  
  const parts: ReactNode[] = [];
  const regex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let match;
  let hasMatches = false;
  
  while ((match = regex.exec(text)) !== null) {
    hasMatches = true;
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    
    // Add bold text
    parts.push(<strong key={match.index}>{match[1]}</strong>);
    
    lastIndex = regex.lastIndex;
  }
  
  // Add remaining text after last match
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  // If no matches found, return original text as string
  // Otherwise return array of parts (React can render arrays)
  return hasMatches ? parts : text;
}

function getOpenClosedStatus(regularHours: Array<{ day: string; ranges: string }>): string | null {
  if (!regularHours || regularHours.length === 0) return null;
  
  const now = new Date();
  const dayNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayNamesFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const currentDayIndex = now.getDay();
  const currentDayShort = dayNamesShort[currentDayIndex];
  const currentDayFull = dayNamesFull[currentDayIndex];
  
  // Find today's hours - check for both short and full day names
  const todayHours = regularHours.find((h: { day: string; ranges: string }) => {
    const day = h.day.trim();
    return day === currentDayShort || 
           day === currentDayFull || 
           day === currentDayShort.substring(0, 3) ||
           day.toLowerCase() === currentDayFull.toLowerCase();
  });
  
  if (!todayHours || !todayHours.ranges) return null;
  
  // Check if "Closed" is in the hours
  if (todayHours.ranges.toLowerCase().includes('closed')) {
    return 'Closed';
  }
  
  // If hours exist and don't say "Closed", show that hours are available
  // (We're not parsing actual times to determine "Open now" vs "Closed now" for simplicity)
  return 'Hours available';
}

export default async function BuffetPage({ params }: BuffetPageProps) {
  perfReset();
  const pageStart = performance.now();
  const endPage = perfStart('page_total');

  const endBuffet = perfStart('getBuffetNameBySlug');
  const buffet = await getCachedBuffet(params['city-state'], params.slug);
  endBuffet();

  if (!buffet) {
    endPage();
    notFound();
  }

  // Parallel fetch: menu + city + transforms (no waterfall)
  const menuPromise = buffet.placeId
    ? getCachedMenu(buffet.placeId)
    : Promise.resolve(null);
  const cityPromise = getCachedCity(params['city-state']);
  const transformsPromise = getCachedPageTransforms(params['city-state'], params.slug);

  const endParallel = perfStart('parallel_menu_city_transforms');
  const [menuResult, cityResult, transformsResult] = await Promise.allSettled([
    menuPromise,
    cityPromise,
    transformsPromise,
  ]);
  endParallel();

  const transforms = transformsResult.status === 'fulfilled'
    ? transformsResult.value
    : computeTransforms(buffet);
  if (transformsResult.status === 'rejected') {
    console.error('[BuffetPage] Error fetching transforms, using fallback:', transformsResult.reason);
  }

  let menuData: {
    categories?: Array<{ name: string; items: Array<{ name: string; description?: string | null; price?: string | null; }> }>;
    sourceUrl?: string;
    items?: Array<{ name: string; description?: string | null; price?: string | null; categoryName?: string }>;
  } | null = null;

  if (menuResult.status === 'fulfilled' && menuResult.value) {
    const menu = menuResult.value;
    if (menu.categories?.length > 0 || menu.items?.length > 0) {
      menuData = menu;
    }
    if (menu.sourceUrl && !buffet.contactInfo?.menuUrl) {
      buffet.contactInfo = buffet.contactInfo || {};
      buffet.contactInfo.menuUrl = menu.sourceUrl;
    }
  } else if (menuResult.status === 'rejected') {
    console.error('[BuffetPage] Error fetching menu:', menuResult.reason);
  }

  const cityInfo = cityResult.status === 'fulfilled' ? cityResult.value : null;
  if (cityResult.status === 'rejected') {
    console.error('[BuffetPage] Error fetching city:', cityResult.reason);
  }

  const endTransforms = perfStart('transforms_consume');
  const {
    regularHours,
    secondaryHours,
    popularTimesSummary,
    popularTimes,
    orderByItems: validOrderByItems,
    decisionSummary,
    sortedImages,
    precomputedAdditionalInfo,
  } = transforms;
  endTransforms();

  if (process.env.NODE_ENV === 'development') {
    const firstPhotoRef =
      sortedImages?.find((img: any) => typeof img?.photoReference === 'string')?.photoReference || null;
    if (firstPhotoRef) {
      const debugUrl = `/api/photo?photoReference=${encodeURIComponent(firstPhotoRef)}&w=800`;
      console.log('[photos-test] photoReference:', firstPhotoRef);
      console.log('[photos-test] url:', debugUrl);
    }
  }

  // Fetch nearby buffets for comparison
  let nearbyBuffetsForComparison: Array<{
    id: string;
    name: string;
    slug: string;
    citySlug: string;
    rating: number;
    reviewsCount?: number;
    price?: string | null;
    distance: number;
  }> = [];

  // DISABLED: getNearbyBuffets fetches ALL buffets which is too slow
  // TODO: Optimize getNearbyBuffets to use geo-queries instead of fetching all data
  // if (buffet.location?.lat && buffet.location?.lng) {
  //   try {
  //     const nearby = await getNearbyBuffets(...)
  //   } catch (error) {
  //     console.error('Error fetching nearby buffets:', error);
  //   }
  // }

  // Fetch buffets for internal linking
  let sameCityBuffets: Array<{
    id: string;
    name: string;
    slug: string;
    citySlug: string;
    rating?: number;
  }> = [];
  
  let sameRoadBuffets: Array<{
    id: string;
    name: string;
    slug: string;
    citySlug: string;
    rating?: number;
  }> = [];
  
  let nearbyBuffetsForLinking: Array<{
    id: string;
    name: string;
    slug: string;
    citySlug: string;
    rating?: number;
    distance?: number;
  }> = [];

  // Derive sameCityBuffets from city (already fetched in parallel above)
  if (cityInfo?.buffets) {
    sameCityBuffets = cityInfo.buffets
      .filter((b: any) => !buffet.id || b.id !== buffet.id)
      .slice(0, 8)
      .map((b: any) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        citySlug: b.citySlug || params['city-state'],
        rating: b.rating,
      }));
  }

  // Open status from cached regularHours
  const openStatus = getOpenClosedStatus(regularHours);

  // cityData from city (already fetched in parallel above)
  const cityData: { name: string; buffetCount: number } | null = cityInfo
    ? {
        name: cityInfo.city,
        buffetCount: cityInfo.buffets?.length || 0,
      }
    : null;

  // Extract city and state from buffet address
  const addressObj = typeof buffet.address === 'object' ? buffet.address : null;
  const cityName = cityData?.name || addressObj?.city || '';
  
  // Extract state from address or from city-state slug (e.g., "salem-or" -> "or")
  let stateAbbr = addressObj?.stateAbbr || '';
  let stateName = addressObj?.state || '';
  
  // Fallback: Extract state from city-state slug if not in address
  if (!stateAbbr && params['city-state']) {
    const slugParts = params['city-state'].split('-');
    const lastPart = slugParts[slugParts.length - 1];
    // If last part is 2 characters, it's likely the state abbreviation
    if (lastPart && lastPart.length === 2) {
      stateAbbr = lastPart.toUpperCase();
    }
  }
  
  // Get state name from abbreviation using simple lookup (no database call)
  if (stateAbbr && !stateName) {
    stateName = getStateName(stateAbbr);
  }

  // Generate H1 text with city and state
  let h1Text = buffet.name;
  if (cityName && stateAbbr) {
    h1Text = buffet.name + ' in ' + cityName + ', ' + stateAbbr;
  } else if (cityName) {
    h1Text = buffet.name + ' in ' + cityName;
  }

  // Define Jump To sections - POIBundle handles actual content check internally
  const hasNearbyPlaces = buffet.transportationAutomotive || buffet.retailShopping || buffet.recreationEntertainment;
  const hasMenu = menuData && ((menuData.categories?.length ?? 0) > 0 || (menuData.items?.length ?? 0) > 0);
  const jumpToSections = [
    { id: 'overview', label: 'Overview' },
    sortedImages && sortedImages.length > 0 ? { id: 'photos', label: 'Photos' } : null,
    buffet.hours ? { id: 'hours-location', label: 'Hours & Location' } : null,
    { id: 'accessibility-amenities', label: 'Amenities' },
    hasMenu ? { id: 'menu', label: 'Menu' } : null,
    buffet.reviews ? { id: 'reviews', label: 'Reviews' } : null,
    { id: 'faqs', label: 'FAQs' },
    hasNearbyPlaces ? { id: 'nearby-places', label: 'Nearby' } : null,
  ].filter(Boolean) as Array<{ id: string; label: string }>;

  const endPoiBreadcrumb = perfStart('transforms_poi_breadcrumb');
  // Build breadcrumb items: Home - State - City - Buffet
  const breadcrumbItems = [];

  // Add home icon as first item
  breadcrumbItems.push({
    name: 'Home',
    url: '/',
    icon: true,
  });

  // Add state breadcrumb if we have state (use full state name, not abbreviation)
  if (stateAbbr && stateName) {
    breadcrumbItems.push({
      name: stateName,
      url: `/chinese-buffets/states/${stateAbbr.toLowerCase()}`,
    });
  }

  // Add city breadcrumb if we have city name
  if (cityName) {
    breadcrumbItems.push({
      name: cityName,
      url: `/chinese-buffets/${params['city-state']}`,
    });
  }

  // Add current buffet (last item, not linked)
  breadcrumbItems.push({
    name: buffet.name,
    url: `/chinese-buffets/${params['city-state']}/${params.slug}`,
  });

  endPoiBreadcrumb();

  const endJsonLd = perfStart('SeoJsonLd');
  const totalMs = Math.round(performance.now() - pageStart);
  perfSummary(totalMs);
  endPage();

  return (
    <>
      <Suspense fallback={null}>
        <StreamableSection>
          <SeoJsonLd
            cityState={params['city-state']}
            slug={params.slug}
          />
        </StreamableSection>
      </Suspense>
      <div className="page-bg container mx-auto px-4 py-8 pb-24 md:pb-8">
        <Breadcrumb items={breadcrumbItems} />
        
        {/* 2-Column Layout: Mobile 1-col, Desktop 2-col with sticky sidebar */}
        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8 xl:gap-12">
          {/* LEFT COLUMN: Main Content */}
          <div className="min-w-0">
            {/* ============================================
                ABOVE-THE-FOLD PAYLOAD (Server-rendered, LCP-critical)
                - Hero with title + location
                - Compact rating + review + price + status badges
                - Primary action buttons
                - Quick facts card
                ============================================ */}
            <PageSection variant="base">
            <AboveTheFold>
          {/* Hero Header - Mobile-first, Yelp/Google Maps quality */}
          <BuffetHeroHeader buffet={buffet} openStatus={openStatus} />

          {/* Quick verdict - scannable summary from rating, reviews, amenities */}
          <QuickVerdict buffet={buffet} precomputedAdditionalInfo={precomputedAdditionalInfo} />

          {/* Map Section - Directly below hero */}
          {buffet.location?.lat && buffet.location?.lng && (
            <div className="mt-4 rounded-xl overflow-hidden shadow-[var(--shadow-soft)]">
              <BuffetLocationMap
                id={buffet.id}
                name={buffet.name}
                lat={buffet.location.lat}
                lng={buffet.location.lng}
                rating={buffet.rating}
              />
            </div>
          )}

          {/* Quick Facts Card - No longer needed, will be merged into About */}
          <div className="hidden">
          <SectionCard
            title="Quick facts"
            titleIcon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            }
            className="mb-4"
          >
            <StatRow>
              {buffet.address && (
                <StatItem
                  label="Address"
                  value={buffet.address}
                  icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  }
                />
              )}
              {buffet.contactInfo?.phone && (
                <StatItem
                  label="Phone"
                  value={buffet.contactInfo.phone}
                  href={`tel:${buffet.contactInfo.phone}`}
                  icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  }
                />
              )}
              {regularHours.length > 0 && (() => {
                const now = new Date();
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const currentDay = dayNames[now.getDay()];
                const todayHours = regularHours.find((h: { day: string; ranges: string }) => 
                  h.day.toLowerCase().startsWith(currentDay.toLowerCase())
                );
                
                if (todayHours) {
                  return (
                    <StatItem
                      label="Hours today"
                      value={todayHours.ranges}
                      icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      }
                    />
                  );
                }
                return null;
              })()}
              {buffet.contactInfo?.website && (
                <StatItem
                  label="Website"
                  value="Visit website"
                  href={buffet.contactInfo.website}
                  icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                  }
                />
              )}
              {buffet.price && (
                <StatItem
                  label="Price range"
                  value={buffet.price}
                  icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                />
              )}
              {buffet.rating && buffet.reviewsCount && (
                <StatItem
                  label="Rating"
                  value={`${buffet.rating.toFixed(1)} stars (${buffet.reviewsCount.toLocaleString()} reviews)`}
                  icon={
                    <svg className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20">
                      <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                    </svg>
                  }
                />
              )}
            </StatRow>
          </SectionCard>
          </div>
          
          {/* Should You Eat Here? Verdict Module - Critical for decision-making */}
          <VerdictModule buffet={buffet} />
          
          {/* Best for / Not ideal for Section - Helps quick decision */}
          <BestForSection buffet={buffet} />
        </AboveTheFold>
        </PageSection>
        
        {/* Jump To Navigation - Mobile */}
        <div className="lg:hidden mb-6">
          <JumpToNav sections={jumpToSections} variant="dropdown" />
        </div>
        
        <Suspense fallback={<SectionFallback />}>
          <StreamableSection>
            <SEOContentBundle buffet={buffet} />
          </StreamableSection>
        </Suspense>
        
      <Suspense fallback={<SectionFallback />}>
        <StreamableSection>
      <PageSection variant="base">
      {/* About Card - Signature Style */}
      <section id="overview" className="scroll-mt-24">
        <SignatureCard
          minimal
          title="About"
          titleIcon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          centerTitle
          className="page-block-gap"
        >
            {/* Overview text */}
            {(buffet.description2 || buffet.description) && (
              <ShowMore 
                initialLines={4}
                className="mb-4"
              >
                <div className="text-sm md:text-base text-[var(--text-secondary)] leading-relaxed w-full">
                  {renderBoldText(buffet.description2 || buffet.description || '')}
                </div>
              </ShowMore>
            )}
            
            {/* Natural Modifier Text */}
            {(() => {
              const modifierTexts = generateModifierTexts(buffet);
              const modifierParagraphs: string[] = [];
              
              if (modifierTexts.familyFriendly) modifierParagraphs.push(modifierTexts.familyFriendly);
              if (modifierTexts.budgetFriendly) modifierParagraphs.push(modifierTexts.budgetFriendly);
              
              if (modifierParagraphs.length > 0) {
                return (
                  <div className="text-sm text-[var(--muted)] leading-relaxed bg-[var(--accent-light)] px-3 py-2 rounded-[var(--radius-md)] mb-4">
                    {modifierParagraphs.join(' ')}
                  </div>
                );
              }
              return null;
            })()}
            
            {/* Key Facts Grid - full width, aligned with modifier text above */}
            <SectionDivider className="!my-4" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 [&>*]:min-w-0 w-full max-w-full">
              {buffet.address && (
                <IconLabel
                  icon={
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  }
                  label="Address"
                  value={buffet.address}
                />
              )}
              {buffet.contactInfo?.phone && (
                <IconLabel
                  icon={
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  }
                  label="Phone"
                  value={buffet.contactInfo.phone}
                  href={`tel:${buffet.contactInfo.phone}`}
                />
              )}
              {regularHours.length > 0 && (() => {
                const now = new Date();
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const currentDay = dayNames[now.getDay()];
                const todayHours = regularHours.find((h: { day: string; ranges: string }) => 
                  h.day.toLowerCase().startsWith(currentDay.toLowerCase())
                );
                
                if (todayHours) {
                  return (
                    <IconLabel
                      icon={
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      }
                      label="Today"
                      value={todayHours.ranges}
                    />
                  );
                }
                return null;
              })()}
              {buffet.price && (
                <IconLabel
                  icon={
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                  label="Price"
                  value={buffet.price}
                />
              )}
              {buffet.rating && buffet.reviewsCount && (
                <IconLabel
                  icon={
                    <svg className="text-yellow-500 fill-current" viewBox="0 0 20 20">
                      <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                    </svg>
                  }
                  label="Rating"
                  value={`${buffet.rating.toFixed(1)} (${buffet.reviewsCount.toLocaleString()} reviews)`}
                />
              )}
            </div>
        </SignatureCard>
      </section>
      
      {/* Decision Helper Summary */}
      <BuffetSummaryPanel buffet={buffet} />
      </PageSection>
        </StreamableSection>
      </Suspense>
      
      <Suspense fallback={<SectionFallback />}>
        <StreamableSection>
      <PageSection variant="alt">
      {sortedImages && sortedImages.length > 0 ? (
        <section id="photos" className="scroll-mt-24">
          <SignatureCard 
            minimal
            title="Photos"
            titleIcon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
            centerTitle
            className="page-block-gap"
          >
            {buffet.imageCategories && buffet.imageCategories.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {buffet.imageCategories.map((category: string, index: number) => (
                  <PillChip key={index} variant="neutral">
                    {category}
                  </PillChip>
                ))}
              </div>
            )}
          {(() => {
            const INITIAL_IMAGES = 12;
            const visibleImages = sortedImages.slice(0, INITIAL_IMAGES);
            const hiddenImages = sortedImages.slice(INITIAL_IMAGES);
            const hasMoreImages = hiddenImages.length > 0;

            const renderImage = (image: any, index: number, baseIndex: number) => {
              const aspectRatio = (typeof image === 'object' && image.widthPx && image.heightPx)
                ? image.widthPx / image.heightPx
                : 4 / 3;
              const isLCP = baseIndex === 0;
              let proxiedUrl: string | null = null;
              if (typeof image === 'object' && image?.photoReference) {
                proxiedUrl = `/api/photo?photoReference=${encodeURIComponent(image.photoReference)}&w=800`;
              }
              if (!proxiedUrl) return null;
              return (
                <div
                  key={baseIndex}
                  className="relative overflow-hidden rounded-[var(--radius-md)] bg-[var(--accent-light)]"
                  style={{ aspectRatio }}
                >
                  <img
                    src={proxiedUrl}
                    alt={`${buffet.name} image ${baseIndex + 1}`}
                    loading={isLCP ? 'eager' : 'lazy'}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </div>
              );
            };

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {visibleImages.map((image, index) => renderImage(image, index, index))}
                </div>
                {hasMoreImages && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-[var(--accent1)] hover:underline list-none py-2">
                      Show {hiddenImages.length} more photos
                    </summary>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
                      {hiddenImages.map((image, index) => renderImage(image, index, INITIAL_IMAGES + index))}
                    </div>
                  </details>
                )}
              </div>
            );
          })()}
          </SignatureCard>
        </section>
      ) : (
        <section id="photos" className="scroll-mt-24">
          <SignatureCard
            minimal
            title="Photos"
            titleIcon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
            centerTitle
            className="page-block-gap"
          >
            <div className="text-sm text-[var(--text-secondary)]">No photos available.</div>
          </SignatureCard>
        </section>
      )}
      {buffet.hours && (
        <section id="hours-location" className="scroll-mt-24">
          <SignatureCard
            minimal
            title="Hours & Location"
            titleIcon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            centerTitle
            className="page-block-gap"
          >
          {/* Late-night modifier text */}
          {(() => {
            const modifierTexts = generateModifierTexts(buffet);
            if (modifierTexts.lateNight) {
              return (
                <div className="mb-3 p-2.5 bg-[var(--accent-light)] rounded-[var(--radius-md)] text-sm text-[var(--text-secondary)] leading-relaxed">
                  {modifierTexts.lateNight}
                </div>
              );
            }
            return null;
          })()}
          
          <div className="space-y-2">
            {regularHours.length > 0 && (
              <Accordion
                title="Regular Hours"
                summary={`${regularHours.length} days`}
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                defaultExpanded={false}
                variant="compact"
              >
                <div className="space-y-2 text-sm">
                  {regularHours.map((item) => (
                    <div key={item.day} className="flex gap-3">
                      <div className="min-w-[5.5rem] shrink-0 font-medium text-[var(--text-secondary)]">{item.day}</div>
                      <div className="min-w-0 text-[var(--muted)]">{item.ranges}</div>
                    </div>
                  ))}
                </div>
              </Accordion>
            )}
            {popularTimesSummary && popularTimes.length > 0 && (
              <Accordion
                title="Popular Times"
                summary="See when it's busiest"
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                }
                defaultExpanded={false}
                variant="compact"
              >
                <div className="space-y-3">
                  {popularTimes.map((day) => (
                    <div key={day.day}>
                      <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">{day.day}</div>
                      <div className="flex items-end gap-0.5 h-10 bg-[var(--accent-light)] rounded-[var(--radius-sm)] px-1 overflow-x-auto">
                        {day.entries.map((entry, idx) => (
                          <div
                            key={`${day.day}-${idx}`}
                            className="flex-1 min-w-[2px] rounded-sm"
                            style={{ 
                              height: `${Math.max(2, Math.min(100, entry.occupancyPercent))}%`,
                              background: 'linear-gradient(to top, var(--accent1), var(--accent2))'
                            }}
                            title={`${entry.hour}:00 - ${entry.occupancyPercent}%`}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Accordion>
            )}
            {secondaryHours.length > 0 && (
              <Accordion
                title="Secondary Hours"
                summary={`${secondaryHours.length} days`}
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
                defaultExpanded={false}
                variant="compact"
              >
                <div className="space-y-2 text-sm">
                  {secondaryHours.map((item) => (
                    <div key={item.day} className="flex gap-3">
                      <div className="min-w-[5.5rem] shrink-0 font-medium text-[var(--text-secondary)]">{item.day}</div>
                      <div className="min-w-0 text-[var(--muted)]">{item.ranges}</div>
                    </div>
                  ))}
                </div>
              </Accordion>
            )}
          </div>
          </SignatureCard>
        </section>
      )}
      </PageSection>
        </StreamableSection>
      </Suspense>
      {/* Contact section removed - merged into About card above */}
      {false && buffet.contactInfo && (buffet.contactInfo.phone || buffet.contactInfo.menuUrl || buffet.contactInfo.website || buffet.contactInfo.orderBy) && (
        <section id="contact" className="mb-6 scroll-mt-24">
          <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {buffet.contactInfo.phone && (
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 bg-[var(--accent-light)] rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-[var(--accent1)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-gray-500 mb-1">Phone</div>
                    <a 
                      href={`tel:${buffet.contactInfo.phone}`} 
                      className="text-lg font-medium text-[var(--accent1)] hover:opacity-80 hover:underline"
                    >
                      {buffet.contactInfo.phone}
                    </a>
                  </div>
                </div>
              )}
              {buffet.contactInfo.menuUrl && (
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-gray-500 mb-1">Menu</div>
                    <a 
                      href={typeof buffet.contactInfo.menuUrl === 'string' ? buffet.contactInfo.menuUrl : '#'} 
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-lg font-medium text-green-600 hover:text-green-800 hover:underline inline-flex items-center gap-1"
                    >
                      View Menu
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                </div>
              )}
              {buffet.contactInfo.website && (
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-gray-500 mb-1">Website</div>
                    <a 
                      href={buffet.contactInfo.website} 
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-lg font-medium text-indigo-600 hover:text-indigo-800 hover:underline inline-flex items-center gap-1"
                    >
                      Visit Website
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                </div>
              )}
              {validOrderByItems.length > 0 && (
                <div className="md:col-span-2">
                  <div className="text-sm text-gray-500 mb-3">Order Online</div>
                  <div className="flex flex-wrap gap-2">
                    {validOrderByItems.map((item, index) => {
                      // Ensure URL is a string and valid
                      const urlString = typeof item.url === 'string' ? item.url : '';
                      const isValidUrl = urlString && (urlString.startsWith('http://') || urlString.startsWith('https://'));
                      
                      return isValidUrl ? (
                        <a
                          key={index}
                          href={urlString}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm cursor-pointer"
                        >
                          {item.name}
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      ) : (
                        <span
                          key={index}
                          className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium text-sm"
                        >
                          {item.name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
      
      <Suspense fallback={<SectionFallback />}>
        <StreamableSection>
      <PageSection variant="base">
      {/* Accessibility & Amenities Section - Refactored with Accordions */}
      {(() => {
        // Check structuredData amenities/accessibility
        const hasStructuredAccessibility = buffet.accessibility && (
          Array.isArray(buffet.accessibility) 
            ? buffet.accessibility.length > 0 
            : Object.keys(buffet.accessibility).length > 0
        );
        
        const hasStructuredAmenities = buffet.amenities && typeof buffet.amenities === 'object' && (
          buffet.amenities.atmosphere ||
          buffet.amenities['food options'] ||
          buffet.amenities.parking ||
          buffet.amenities.payments ||
          buffet.amenities['service options'] ||
          buffet.amenities.highlights ||
          buffet.amenities.offerings ||
          buffet.amenities.amenities
        );
        
        // Check additionalInfo (Google Places data) - cast to any to access additionalInfo
        const additionalInfo = (buffet as any).additionalInfo;
        const hasAdditionalAccessibility = additionalInfo?.Accessibility && 
          Array.isArray(additionalInfo.Accessibility) && 
          additionalInfo.Accessibility.length > 0;
        const hasAdditionalAmenities = additionalInfo && (
          (additionalInfo['Service options'] && Array.isArray(additionalInfo['Service options']) && additionalInfo['Service options'].length > 0) ||
          (additionalInfo.Amenities && Array.isArray(additionalInfo.Amenities) && additionalInfo.Amenities.length > 0) ||
          (additionalInfo.Atmosphere && Array.isArray(additionalInfo.Atmosphere) && additionalInfo.Atmosphere.length > 0) ||
          (additionalInfo.Highlights && Array.isArray(additionalInfo.Highlights) && additionalInfo.Highlights.length > 0) ||
          (additionalInfo.Offerings && Array.isArray(additionalInfo.Offerings) && additionalInfo.Offerings.length > 0) ||
          (additionalInfo['Dining options'] && Array.isArray(additionalInfo['Dining options']) && additionalInfo['Dining options'].length > 0) ||
          (additionalInfo.Payments && Array.isArray(additionalInfo.Payments) && additionalInfo.Payments.length > 0) ||
          (additionalInfo.Planning && Array.isArray(additionalInfo.Planning) && additionalInfo.Planning.length > 0)
        );
        
        return hasStructuredAccessibility || hasStructuredAmenities || hasAdditionalAccessibility || hasAdditionalAmenities;
      })() ? (
        <section id="accessibility-amenities" className="scroll-mt-24">
          <SignatureCard
            minimal
            title="Amenities & Services"
            titleIcon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            }
            centerTitle
            className="page-block-gap"
          >
            <div className="space-y-2">
            {/* Accessibility Accordion */}
            {(buffet.accessibility || precomputedAdditionalInfo?.['Accessibility']) && (
              <Accordion
                title="Accessibility"
                summary="Wheelchair, parking, and more"
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                }
                defaultExpanded={false}
                variant="compact"
              >
                <Accessibility data={buffet.accessibility || precomputedAdditionalInfo?.['Accessibility'] || {}} />
              </Accordion>
            )}

            {/* Amenities Accordion */}
            {(buffet.amenities?.amenities || precomputedAdditionalInfo?.['Amenities']) && (
              <Accordion
                title="Amenities"
                summary="Available facilities and features"
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                }
                defaultExpanded={false}
                variant="compact"
              >
                <Amenities data={buffet.amenities || { amenities: precomputedAdditionalInfo?.['Amenities'] }} />
              </Accordion>
            )}

            {/* Atmosphere Accordion */}
            {(buffet.amenities?.atmosphere || precomputedAdditionalInfo?.['Atmosphere']) && (
              <Accordion
                title="Atmosphere"
                summary="Ambiance and setting"
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                }
                defaultExpanded={false}
                variant="compact"
              >
                <Atmosphere data={buffet.amenities?.atmosphere || precomputedAdditionalInfo?.['Atmosphere'] || {}} />
              </Accordion>
            )}

            {/* Food Options Accordion */}
            {(buffet.amenities?.['food options'] || precomputedAdditionalInfo?.['Dining options']) && (
              <Accordion
                title="Dining Options"
                summary="Food and beverage choices"
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                }
                defaultExpanded={false}
                variant="compact"
              >
                <FoodOptions data={buffet.amenities?.['food options'] || precomputedAdditionalInfo?.['Dining options'] || {}} />
              </Accordion>
            )}

            {/* Service Options Accordion */}
            {(buffet.amenities?.['service options'] || precomputedAdditionalInfo?.['Service options']) && (
              <Accordion
                title="Service Options"
                summary="Dine-in, takeout, delivery"
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                }
                defaultExpanded={false}
                variant="compact"
              >
                <ServiceOptionsSection data={buffet.amenities?.['service options'] || precomputedAdditionalInfo?.['Service options'] || {}} />
                {(() => {
                  const modifierTexts = generateModifierTexts(buffet);
                  const serviceTexts: string[] = [];
                  if (modifierTexts.takeout) serviceTexts.push(modifierTexts.takeout);
                  if (modifierTexts.delivery) serviceTexts.push(modifierTexts.delivery);
                  if (serviceTexts.length > 0) {
                    return (
                      <p className="mt-2 text-xs text-gray-600 italic">
                        {serviceTexts.join(' ')}
                      </p>
                    );
                  }
                  return null;
                })()}
              </Accordion>
            )}

            {/* Parking Accordion */}
            {buffet.amenities?.parking && (
              <Accordion
                title="Parking"
                summary="Parking availability"
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                }
                defaultExpanded={false}
                variant="compact"
              >
                <Parking data={buffet.amenities.parking} />
                {(() => {
                  const modifierTexts = generateModifierTexts(buffet);
                  if (modifierTexts.parking) {
                    return (
                      <p className="mt-2 text-xs text-gray-600 italic">
                        {modifierTexts.parking}
                      </p>
                    );
                  }
                  return null;
                })()}
              </Accordion>
            )}

            {/* Payments Accordion */}
            {(buffet.amenities?.payments || precomputedAdditionalInfo?.['Payments']) && (
              <Accordion
                title="Payment Methods"
                summary="Accepted payment types"
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                }
                defaultExpanded={false}
                variant="compact"
              >
                <Payment data={buffet.amenities?.payments || precomputedAdditionalInfo?.['Payments'] || {}} />
              </Accordion>
            )}

            {/* Highlights Accordion */}
            {(buffet.amenities?.highlights || precomputedAdditionalInfo?.['Highlights']) && (
              <Accordion
                title="Highlights"
                summary="Special features"
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                }
                defaultExpanded={false}
                variant="compact"
              >
                <Highlights data={buffet.amenities?.highlights || precomputedAdditionalInfo?.['Highlights'] || {}} />
              </Accordion>
            )}

            {/* Food & Drink Accordion */}
            {buffet.amenities?.['food and drink'] && (
              <Accordion
                title="Food & Drink"
                summary="Menu offerings"
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                }
                defaultExpanded={false}
                variant="compact"
              >
                <FoodAndDrink data={buffet.amenities['food and drink']} />
              </Accordion>
            )}

            {/* Planning Accordion */}
            {(buffet.amenities?.planning || precomputedAdditionalInfo?.['Planning']) && (
              <Accordion
                title="Planning"
                summary="Reservations and groups"
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                }
                defaultExpanded={false}
                variant="compact"
              >
                <Planning data={buffet.amenities?.planning || precomputedAdditionalInfo?.['Planning'] || {}} />
              </Accordion>
            )}
            </div>
          </SignatureCard>
        </section>
      ) : null}
      </PageSection>
        </StreamableSection>
      </Suspense>
      
      <Suspense fallback={<SectionFallback />}>
        <StreamableSection>
      <PageSection variant="alt">
      {/* ============================================
          MENU SECTION - Displays restaurant menu if available
          ============================================ */}
      {menuData && ((menuData.categories?.length ?? 0) > 0 || (menuData.items?.length ?? 0) > 0) && (
        <section id="menu" className="scroll-mt-24">
          <SignatureCard
            minimal
            title="Menu"
            titleIcon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
            centerTitle
            className="page-block-gap"
          >
            <Menu menu={menuData} />
          </SignatureCard>
        </section>
      )}
      </PageSection>
        </StreamableSection>
      </Suspense>
      
      <Suspense fallback={<SectionFallback />}>
        <StreamableSection>
      <PageSection variant="base">
      {/* ============================================
          REVIEWS BUNDLE (Separate chunk, loads on viewport approach)
          Shows summary immediately, loads full content when scrolling near
          ============================================ */}
      <section id="reviews" className="scroll-mt-24">
        <SignatureCard minimal noPadding>
          <ReviewsBundle
            reviews={buffet.reviews}
            reviewsCount={buffet.reviewsCount}
            rating={buffet.rating}
            reviewsDistribution={buffet.reviewsDistribution}
            reviewsTags={buffet.reviewsTags}
          />
        </SignatureCard>
      </section>
      </PageSection>
        </StreamableSection>
      </Suspense>
      
      <Suspense fallback={<SectionFallback />}>
        <StreamableSection>
      <PageSection variant="alt">
      {/* FAQs Section - Includes Common Questions (Answer Engine Q&A) + Database Q&A */}
      <section id="faqs" aria-label="Frequently Asked Questions" className="scroll-mt-24">
        <SignatureCard
          minimal
          title="Frequently Asked Questions"
          titleIcon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          centerTitle
          className="page-block-gap"
        >
          <AnswerEngineQA buffet={buffet} />
        </SignatureCard>
      </section>
      </PageSection>
        </StreamableSection>
      </Suspense>
      
      <Suspense fallback={<SectionFallback />}>
        <StreamableSection>
      <PageSection variant="base">
      {/* ============================================
          NEARBY PLACES - Rendered by POIBundle (includes section wrapper)
          ============================================ */}
      <POIBundle buffet={buffet} />
      
      {/* ============================================
          COMPARISON BUNDLE (Separate chunk, loads on viewport approach)
          - BuffetComparisonGrid
          - InternalLinkingBlocks
          - CityStateHubLinks
          ============================================ */}
      <ComparisonBundle
        nearbyBuffetsForComparison={nearbyBuffetsForComparison}
        sameCityBuffets={sameCityBuffets}
        sameRoadBuffets={sameRoadBuffets}
        nearbyBuffetsForLinking={nearbyBuffetsForLinking}
        cityName={cityName}
        stateName={stateName}
        stateAbbr={stateAbbr}
        citySlug={params['city-state']}
        buffetCount={cityData?.buffetCount}
      />
      </PageSection>
        </StreamableSection>
      </Suspense>
          </div>
          {/* END LEFT COLUMN */}

          {/* RIGHT COLUMN: Sticky Sidebar - Glass Style (streams in, below fold on mobile) */}
          <Suspense fallback={<aside className="hidden lg:block"><div className="h-48 rounded bg-[var(--muted)]/20 animate-pulse" aria-hidden /></aside>}>
            <StreamableSection>
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-4">
              {/* Jump To Navigation - Glass */}
              <JumpToNav sections={jumpToSections} variant="chips" glass />

              {/* Quick Info Card - Contextual timing & hours */}
              {(() => {
                // Calculate next closing time if open today
                const getNextClosingTime = (): string | null => {
                  if (!regularHours.length || openStatus === 'Closed') return null;
                  
                  const now = new Date();
                  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                  const currentDay = dayNames[now.getDay()];
                  const todayHours = regularHours.find((h: { day: string; ranges: string }) => 
                    h.day.toLowerCase().startsWith(currentDay.toLowerCase())
                  );
                  
                  if (!todayHours || !todayHours.ranges) return null;
                  
                  // Parse closing time from ranges (e.g., "11 AM – 9 PM" -> "9 PM")
                  const ranges = todayHours.ranges;
                  const match = ranges.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)|(?:\d{1,2})\s*(?:AM|PM))\s*[–-]\s*(\d{1,2}:\d{2}\s*(?:AM|PM)|(?:\d{1,2})\s*(?:AM|PM))/i);
                  if (match && match[2]) {
                    return match[2].trim();
                  }
                  
                  // Fallback: try to extract last time mentioned
                  const timeMatches = ranges.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/gi);
                  if (timeMatches && timeMatches.length > 0) {
                    return timeMatches[timeMatches.length - 1];
                  }
                  
                  return null;
                };

                // Get tomorrow's hours preview
                const getTomorrowHours = (): string | null => {
                  if (!regularHours.length) return null;
                  
                  const now = new Date();
                  const tomorrow = new Date(now);
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                  const tomorrowDay = dayNames[tomorrow.getDay()];
                  const tomorrowHours = regularHours.find((h: { day: string; ranges: string }) => 
                    h.day.toLowerCase().startsWith(tomorrowDay.toLowerCase())
                  );
                  
                  return tomorrowHours?.ranges || null;
                };

                const nextClosing = getNextClosingTime();
                const tomorrowHours = getTomorrowHours();
                const busyStatus = buffet.hours?.popularTimesLiveText || null;
                const todayHours = regularHours.length > 0 ? (() => {
                  const now = new Date();
                  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                  const currentDay = dayNames[now.getDay()];
                  return regularHours.find((h: { day: string; ranges: string }) => 
                    h.day.toLowerCase().startsWith(currentDay.toLowerCase())
                  )?.ranges || null;
                })() : null;

                // Get service options summary - matches ServiceOptionsSection logic exactly
                const getServiceOptions = (): string | null => {
                  // Use EXACT same data source as Service Options section
                  const serviceOptionsData = buffet.amenities?.['service options'] || 
                    precomputedAdditionalInfo?.['Service options'] || 
                    null;
                  
                  if (!serviceOptionsData) return null;
                  
                  // Helper to check if a value indicates availability (matches ServiceOptionsSection)
                  const isAvailable = (value: any): boolean => {
                    return value === true || value === 'true' || value === 'yes' || value === 1;
                  };
                  
                  // Flatten booleans helper (matches ServiceOptionsSection exactly)
                  const flattenBooleans = (input: Record<string, any>, prefix: string[] = []): Array<[string, boolean | string | number]> => {
                    const results: Array<[string, boolean | string | number]> = [];
                    Object.entries(input).forEach(([key, value]) => {
                      if (value === null || value === undefined) return;
                      if (typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') {
                        results.push([[...prefix, key].join(' '), value]);
                        return;
                      }
                      if (typeof value === 'object' && !Array.isArray(value)) {
                        results.push(...flattenBooleans(value, [...prefix, key]));
                      }
                    });
                    return results;
                  };
                  
                  // Map label helper (matches ServiceOptionsSection exactly)
                  const mapLabel = (value: string): string => {
                    const rawKey = value.split(' ').pop() || value;
                    const normalized = rawKey.replace(/\s+/g, '').toLowerCase();
                    const mapping: Record<string, string> = {
                      takeout: 'Takeout',
                      dinein: 'Dine-in',
                      delivery: 'Delivery',
                      reservable: 'Accepts Reservations',
                      curbsidepickup: 'Curbside Pickup',
                      drivethrough: 'Drive-through',
                      waiterservice: 'Waiter Service',
                      selfservice: 'Self Service',
                      tablereservation: 'Table Reservation',
                      takeoutservice: 'Takeout',
                    };
                    const formatLabel = (val: string): string => {
                      return val
                        .replace(/([A-Z])/g, ' $1')
                        .replace(/^./, (str) => str.toUpperCase())
                        .replace(/_/g, ' ')
                        .trim();
                    };
                    return mapping[normalized] || formatLabel(value);
                  };
                  
                  // Process data exactly like ServiceOptionsSection
                  const entries: Array<[string, boolean | string | number]> = [];
                  
                  if (Array.isArray(serviceOptionsData)) {
                    serviceOptionsData.forEach((item) => {
                      if (typeof item === 'string' && item.trim()) {
                        entries.push([item.trim(), true]);
                      }
                    });
                  } else if (typeof serviceOptionsData === 'object') {
                    entries.push(...flattenBooleans(serviceOptionsData as Record<string, any>));
                  }
                  
                  if (entries.length === 0) return null;
                  
                  // Filter for only available options and format labels
                  // Show ALL available options to match Service Options section
                  const availableOptions = entries
                    .filter(([key, value]) => isAvailable(value))
                    .map(([key]) => mapLabel(key));
                  
                  // Deduplicate and return
                  const uniqueOptions = Array.from(new Set(availableOptions));
                  return uniqueOptions.length > 0 ? uniqueOptions.join(' • ') : null;
                };

                // Get current busy status from histogram
                const getCurrentBusyStatus = (): { label: string; isBusy: boolean } | null => {
                  const histogram = buffet.hours?.popularTimesHistogram;
                  if (!histogram || typeof histogram !== 'object') return null;
                  
                  const now = new Date();
                  const currentHour = now.getHours();
                  const currentDayIndex = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
                  
                  // Map day index to histogram keys
                  const dayMap: Record<number, string> = {
                    0: 'Su', // Sunday
                    1: 'Mo', // Monday
                    2: 'Tu', // Tuesday
                    3: 'We', // Wednesday
                    4: 'Th', // Thursday
                    5: 'Fr', // Friday
                    6: 'Sa', // Saturday
                  };
                  
                  const dayKey = dayMap[currentDayIndex];
                  if (!dayKey || !histogram[dayKey] || !Array.isArray(histogram[dayKey])) return null;
                  
                  // Find the entry for the current hour
                  const currentEntry = histogram[dayKey].find((entry: any) => entry.hour === currentHour);
                  if (!currentEntry || typeof currentEntry.occupancyPercent !== 'number') return null;
                  
                  const occupancy = currentEntry.occupancyPercent;
                  
                  // Determine busy level
                  if (occupancy >= 80) {
                    return { label: 'Very busy', isBusy: true };
                  } else if (occupancy >= 60) {
                    return { label: 'Busy', isBusy: true };
                  } else if (occupancy >= 40) {
                    return { label: 'Moderately busy', isBusy: false };
                  } else if (occupancy >= 20) {
                    return { label: 'Usually not busy', isBusy: false };
                  } else {
                    return { label: 'Not busy', isBusy: false };
                  }
                };

                const serviceOptions = getServiceOptions();
                const currentBusy = getCurrentBusyStatus();

                // Only render if there's at least one unique piece of info
                const hasUniqueInfo = nextClosing || busyStatus || currentBusy || tomorrowHours || (todayHours && openStatus !== 'Closed') || serviceOptions;
                
                if (!hasUniqueInfo) return null;

                return (
                  <SignatureCard
                    glass
                    title="Quick Info"
                    titleIcon={
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    }
                    centerTitle
                  >
                    <div className="space-y-2.5">
                      {/* Today's hours - only if open */}
                      {todayHours && openStatus !== 'Closed' && (
                        <div className="flex items-start gap-2">
                          <svg className="w-4 h-4 text-[var(--muted)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-[var(--muted)] mb-0.5">Today</div>
                            <div className="text-sm font-medium text-[var(--text)]">{todayHours}</div>
                          </div>
                        </div>
                      )}

                      {/* Next closing time */}
                      {nextClosing && openStatus !== 'Closed' && (
                        <div className="flex items-start gap-2">
                          <svg className="w-4 h-4 text-[var(--muted)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-[var(--muted)] mb-0.5">Closes at</div>
                            <div className="text-sm font-medium text-[var(--text)]">{nextClosing}</div>
                          </div>
                        </div>
                      )}

                      {/* Current busy status from live text */}
                      {busyStatus && (
                        <div className="flex items-start gap-2">
                          <svg className="w-4 h-4 text-[var(--muted)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-[var(--muted)] mb-0.5">Right now</div>
                            <div className="text-sm font-medium text-[var(--text)]">{busyStatus}</div>
                          </div>
                        </div>
                      )}

                      {/* Current busy status from histogram */}
                      {currentBusy && !busyStatus && (
                        <div className="flex items-start gap-2">
                          <svg className={`w-4 h-4 flex-shrink-0 mt-0.5 ${currentBusy.isBusy ? 'text-orange-500' : 'text-[var(--muted)]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-[var(--muted)] mb-0.5">Right now</div>
                            <div className={`text-sm font-medium ${currentBusy.isBusy ? 'text-orange-600' : 'text-[var(--text)]'}`}>
                              {currentBusy.label}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Tomorrow's hours preview */}
                      {tomorrowHours && tomorrowHours !== todayHours && (
                        <>
                          <div className="border-t border-[var(--border)] my-2"></div>
                          <div className="flex items-start gap-2">
                            <svg className="w-4 h-4 text-[var(--muted)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-[var(--muted)] mb-0.5">Tomorrow</div>
                              <div className="text-sm font-medium text-[var(--text)]">{tomorrowHours}</div>
                            </div>
                          </div>
                        </>
                      )}

                      {/* Service options */}
                      {serviceOptions && (
                        <>
                          {(nextClosing || busyStatus || currentBusy || tomorrowHours || (todayHours && openStatus !== 'Closed')) && (
                            <div className="border-t border-[var(--border)] my-2"></div>
                          )}
                          <div className="flex items-start gap-2">
                            <svg className="w-4 h-4 text-[var(--muted)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-[var(--muted)] mb-0.5">Available</div>
                              <div className="text-sm font-medium text-[var(--text)]">{serviceOptions}</div>
                            </div>
                          </div>
                        </>
                      )}

                    </div>
                  </SignatureCard>
                );
              })()}

              {/* Quick Actions Card - Glass */}
              <SignatureCard
                glass
                title="Quick Actions"
                titleIcon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                }
                centerTitle
              >
                <div className="space-y-1">
                  {buffet.location?.lat && buffet.location?.lng && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${buffet.location.lat},${buffet.location.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--accent-solid)] hover:bg-[var(--accent-light)] rounded-[var(--radius-md)] transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                      </svg>
                      Get directions
                    </a>
                  )}
                  {buffet.contactInfo?.phone && (
                    <a
                      href={`tel:${buffet.contactInfo.phone}`}
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--accent-light)] hover:text-[var(--accent-solid)] rounded-[var(--radius-md)] transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      Call now
                    </a>
                  )}
                  {buffet.contactInfo?.website && (
                    <a
                      href={buffet.contactInfo.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--accent-light)] hover:text-[var(--accent-solid)] rounded-[var(--radius-md)] transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                      </svg>
                      Visit website
                    </a>
                  )}
                  {buffet.contactInfo?.menuUrl && (
                    <a
                      href={typeof buffet.contactInfo.menuUrl === 'string' ? buffet.contactInfo.menuUrl : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--accent-light)] hover:text-[var(--accent-solid)] rounded-[var(--radius-md)] transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      View menu
                    </a>
                  )}
                </div>
              </SignatureCard>
            </div>
          </aside>
            </StreamableSection>
          </Suspense>
          {/* END RIGHT COLUMN */}
        </div>
        {/* END 2-COLUMN LAYOUT */}
      </div>
      <MobileActionBar buffet={buffet} />
    </>
  );
}
