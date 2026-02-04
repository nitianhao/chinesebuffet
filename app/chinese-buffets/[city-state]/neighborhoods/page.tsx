import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCityNeighborhoodsRollup, STATE_ABBR_TO_NAME } from '@/lib/rollups';
import NeighborhoodsHubClient from '@/components/neighborhoods/NeighborhoodsHubClient';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
const isDev = process.env.NODE_ENV !== 'production';

// ISR: Revalidate every 6 hours in prod, 1 hour in dev
export const revalidate = isDev ? 3600 : 21600;

interface NeighborhoodsIndexPageProps {
  params: {
    'city-state': string;
  };
}

export async function generateMetadata({ params }: NeighborhoodsIndexPageProps): Promise<Metadata> {
  const citySlug = params['city-state'];
  const { data } = await getCityNeighborhoodsRollup(citySlug);
  
  if (!data) {
    return {
      title: 'Neighborhoods Not Found',
    };
  }

  const neighborhoodCount = data.neighborhoods.length;
  
  return {
    title: `Chinese Buffets by Neighborhood in ${data.cityName}, ${data.stateAbbr}`,
    description: `Browse Chinese buffets in ${neighborhoodCount} neighborhoods across ${data.cityName}, ${data.stateAbbr}. Find all-you-can-eat restaurants with hours, prices, and reviews.`,
    alternates: {
      canonical: `${BASE_URL}/chinese-buffets/${citySlug}/neighborhoods`,
    },
  };
}

export default async function NeighborhoodsIndexPage({ params }: NeighborhoodsIndexPageProps) {
  const citySlug = params['city-state'];
  const { data } = await getCityNeighborhoodsRollup(citySlug);
  
  // If no data at all, show 404-like state but don't hard fail
  // The city might exist but have no neighborhood rollup yet
  const cityName = data?.cityName || citySlug.split('-').slice(0, -1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const stateAbbr = data?.stateAbbr || citySlug.split('-').pop()?.toUpperCase() || '';
  const state = data?.state || STATE_ABBR_TO_NAME[stateAbbr] || stateAbbr;
  const neighborhoods = data?.neighborhoods || [];
  
  // Calculate total buffets across all neighborhoods
  const totalBuffets = neighborhoods.reduce((sum, n) => sum + n.buffetCount, 0);
  const isEmpty = neighborhoods.length === 0;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      <header className="bg-[var(--surface)] shadow-sm border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <nav className="text-sm text-[var(--muted)] mb-4">
            <Link href="/" className="hover:text-[var(--accent1)]">Home</Link>
            <span className="mx-2">/</span>
            <Link 
              href={`/chinese-buffets/states/${stateAbbr.toLowerCase()}`}
              className="hover:text-[var(--accent1)]"
            >
              {state}
            </Link>
            <span className="mx-2">/</span>
            <Link 
              href={`/chinese-buffets/${citySlug}`}
              className="hover:text-[var(--accent1)]"
            >
              {cityName}
            </Link>
            <span className="mx-2">/</span>
            <span className="text-[var(--text)]">Neighborhoods</span>
          </nav>
          <h1 className="text-4xl font-bold text-[var(--text)] mb-2">
            Chinese Buffets by Neighborhood in {cityName}
          </h1>
          <p className="text-lg text-[var(--muted)]">
            {totalBuffets} buffets across {neighborhoods.length} neighborhoods
          </p>
        </div>
      </header>

      {/* Intro Section */}
      <section className="bg-[var(--surface)] py-8 border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-[var(--text-secondary)] max-w-3xl">
            {!isEmpty 
              ? `Explore Chinese buffets in ${neighborhoods.length} neighborhoods across ${cityName}, ${stateAbbr}. 
                 Select a neighborhood below to find all-you-can-eat restaurants with detailed hours, 
                 pricing, ratings, and customer reviews.`
              : `We're still mapping neighborhoods in ${cityName}. Browse all buffets in the city instead.`
            }
          </p>
        </div>
      </section>

      {/* Neighborhoods Grid with Filter */}
      <section className="bg-[var(--surface2)] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {isEmpty ? (
            <div className="text-center py-12">
              <p className="text-[var(--muted)] mb-4">
                No neighborhoods with buffets found in {cityName}.
              </p>
              <Link 
                href={`/chinese-buffets/${citySlug}`}
                className="text-[var(--accent1)] hover:opacity-80 font-medium"
              >
                View all buffets in {cityName} →
              </Link>
            </div>
          ) : (
            <NeighborhoodsHubClient 
              neighborhoods={neighborhoods}
              citySlug={citySlug}
            />
          )}
        </div>
      </section>

      {/* Back Navigation */}
      <section className="bg-[var(--surface)] py-6 border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link 
            href={`/chinese-buffets/${citySlug}`}
            className="text-[var(--accent1)] hover:opacity-80 font-medium"
          >
            ← Back to {cityName}
          </Link>
          <span className="mx-4 text-[var(--muted)]">|</span>
          <Link 
            href={`/chinese-buffets/states/${stateAbbr.toLowerCase()}`}
            className="text-[var(--accent1)] hover:opacity-80 font-medium"
          >
            All Cities in {state} →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[var(--headerBg)] text-white py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-white/60">
              Chinese Buffets Directory - Find all-you-can-eat Chinese buffets in {cityName} neighborhoods
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
