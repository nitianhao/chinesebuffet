import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  getBuffetsWithParking,
  getBuffetsNearShoppingMalls,
  getBuffetsNearHighways,
  getBuffetsNearGasStations,
} from '@/lib/data-instantdb';
import { createIndexTierConfig, toMetadataRobots } from '@/lib/index-tier';
import { assessPOIPageQuality, logExcludedPOIPage } from '@/lib/poi-page-quality';
import { createPageSignature, logDuplicateDetection } from '@/lib/duplicate-detection';
import { registerPageSignature, checkForDuplicates } from '@/lib/page-signature-store';

// Page type and index tier declaration
const PAGE_TYPE = 'poi' as const;
const INDEX_TIER = 'tier-2' as const;

interface POILandingPageProps {
  params: {
    'poi-type': string;
  };
}

// POI type configuration
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

// Generate static params for all POI types
export async function generateStaticParams() {
  return Object.keys(POI_TYPES).map((poiType) => ({
    'poi-type': poiType,
  }));
}

export async function generateMetadata({ params }: POILandingPageProps): Promise<Metadata> {
  const poiType = params['poi-type'] as POIType;
  const config = POI_TYPES[poiType];

  // Validate and create index tier configuration
  const pagePath = `/chinese-buffets/near/${params['poi-type']}`;

  if (!config) {
    const indexTierConfig = createIndexTierConfig(PAGE_TYPE, INDEX_TIER, false, pagePath);
    return {
      title: 'Page Not Found',
      robots: toMetadataRobots(indexTierConfig),
    };
  }

  // Fetch buffets to assess page quality
  const buffets = await config.fetchFunction(100);
  const buffetCount = buffets.length;

  // Additional content from the page (description text)
  const additionalContent = config.description || '';

  // Assess POI page quality for conditional indexing
  const qualityResult = assessPOIPageQuality(
    poiType,
    buffetCount,
    config.title,
    config.description,
    config.metaDescription,
    additionalContent,
    5, // Buffet count threshold: minimum 5 buffets
    200 // Content length threshold: minimum 200 characters
  );

  // Log excluded pages with reason codes
  if (!qualityResult.indexable) {
    logExcludedPOIPage(poiType, pagePath, qualityResult);
  }

  // Extract page signature for duplicate detection
  const h1 = config.title;
  const introText = config.description + ' ' + additionalContent;
  const buffetIds = buffets.map((b: any) => b.id).filter(Boolean);
  
  const signature = createPageSignature(
    PAGE_TYPE,
    pagePath,
    [h1], // Headings (H1)
    introText,
    buffetIds
  );
  
  // Register signature and check for duplicates
  registerPageSignature(signature);
  const duplicateResult = checkForDuplicates(signature);
  
  // Log duplicate detection results
  if (duplicateResult.hasDuplicates) {
    logDuplicateDetection(signature, duplicateResult);
  }
  
  // Apply duplicate handling: canonical or noindex
  let robotsConfig = createIndexTierConfig(
    PAGE_TYPE,
    INDEX_TIER,
    qualityResult.indexable, // Conditional: true if quality checks pass
    pagePath
  );
  let canonicalUrl: string | undefined;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
  
  if (duplicateResult.action === 'canonical' && duplicateResult.primaryPage) {
    // Set canonical to primary page
    canonicalUrl = `${baseUrl.replace(/\/$/, '')}${duplicateResult.primaryPage}`;
  } else if (duplicateResult.action === 'noindex') {
    // Apply noindex for high-risk duplicates (overrides quality check)
    robotsConfig = createIndexTierConfig(PAGE_TYPE, INDEX_TIER, false, pagePath);
  }

  const metadata: Metadata = {
    title: config.title,
    description: config.metaDescription,
    openGraph: {
      title: config.title,
      description: config.metaDescription,
    },
    robots: toMetadataRobots(robotsConfig),
  };
  
  if (canonicalUrl) {
    metadata.alternates = {
      canonical: canonicalUrl,
    };
  }

  return metadata;
}

export default async function POILandingPage({ params }: POILandingPageProps) {
  const poiType = params['poi-type'] as POIType;
  const config = POI_TYPES[poiType];

  if (!config) {
    notFound();
  }

  // Fetch buffets for this POI type
  const buffets = await config.fetchFunction(100);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl md:text-5xl font-bold text-[var(--text)] mb-4">
          {config.title}
        </h1>
        <p className="text-lg text-[var(--text-secondary)] leading-relaxed max-w-3xl">
          {config.description}
        </p>
      </div>

      {/* Buffets List */}
      {buffets.length === 0 ? (
        <div className="bg-[var(--surface2)] rounded-lg border border-[var(--border)] p-8 text-center">
          <p className="text-[var(--muted)]">
            No buffets found for this category. Check back soon as we continue to add locations.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between mb-6">
            <p className="text-[var(--muted)]">
              Found {buffets.length} {buffets.length === 1 ? 'buffet' : 'buffets'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {buffets.map((buffet: any) => {
              const citySlug = buffet.citySlug || '';
              const buffetUrl = `/chinese-buffets/${citySlug}/${buffet.slug}`;
              
              return (
                <div
                  key={buffet.id}
                  className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-6 shadow-sm hover:shadow-md hover:border-[var(--accent1)] transition-all group"
                >
                  <Link href={buffetUrl} className="block">
                    <h2 className="text-xl font-semibold text-[var(--text)] mb-2 group-hover:text-[var(--accent1)] transition-colors">
                      {buffet.name}
                    </h2>
                  </Link>
                  
                  <div className="space-y-2 text-sm text-[var(--muted)] mb-4">
                    {buffet.address?.city && buffet.address?.stateAbbr && (
                      <p className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {buffet.address.city}, {buffet.address.stateAbbr}
                      </p>
                    )}
                    
                    {buffet.rating > 0 && (
                      <p className="flex items-center gap-1">
                        <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <span className="font-medium text-[var(--text)]">{buffet.rating.toFixed(1)}</span>
                        {buffet.reviewsCount > 0 && (
                          <span className="text-[var(--muted)]">
                            ({buffet.reviewsCount.toLocaleString()} {buffet.reviewsCount === 1 ? 'review' : 'reviews'})
                          </span>
                        )}
                      </p>
                    )}
                    
                    {buffet.price && (
                      <p className="text-[var(--muted)]">{buffet.price}</p>
                    )}
                  </div>

                  <Link
                    href={buffetUrl}
                    className="inline-flex items-center text-[var(--accent1)] hover:opacity-80 font-medium text-sm transition-colors"
                  >
                    View details
                    <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Additional Info Section */}
      <div className="mt-12 bg-[var(--surface2)] rounded-lg border border-[var(--border)] p-6">
        <h2 className="text-2xl font-bold text-[var(--text)] mb-4">
          About This Category
        </h2>
        <div className="prose prose-gray max-w-none">
          {poiType === 'parking' && (
            <p className="text-[var(--text-secondary)] leading-relaxed">
              Finding a Chinese buffet with convenient parking can make your dining experience much more enjoyable. 
              Whether you're visiting with family, friends, or a large group, easy parking access ensures a stress-free arrival. 
              All buffets listed here have parking available nearby, making them ideal choices for those who prioritize convenience.
            </p>
          )}
          {poiType === 'shopping-malls' && (
            <p className="text-[var(--text-secondary)] leading-relaxed">
              Combining shopping with dining is a popular way to spend the day. These Chinese buffets are located 
              near shopping malls and retail centers, making it easy to enjoy a meal after or during your shopping trip. 
              Perfect for families looking to make the most of their day out.
            </p>
          )}
          {poiType === 'highways' && (
            <p className="text-[var(--text-secondary)] leading-relaxed">
              Traveling on major highways and freeways? These Chinese buffets are conveniently located near major 
              roadways, making them perfect stops for travelers and road trippers. Enjoy a satisfying buffet meal 
              without going too far off your route.
            </p>
          )}
          {poiType === 'gas-stations' && (
            <p className="text-[var(--text-secondary)] leading-relaxed">
              Need to refuel your car and yourself? These Chinese buffets are located near gas stations, making it 
              convenient to combine a fuel stop with a satisfying meal. Perfect for travelers and commuters looking 
              to maximize their time efficiently.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
