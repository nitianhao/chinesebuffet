import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { REGION_STATES, REGION_LABELS, VALID_REGIONS } from '@/lib/regions';
import { STATE_ABBR_TO_NAME } from '@/lib/rollups';
import { getSiteUrl } from '@/lib/site-url';

const BASE_URL = getSiteUrl();

interface RegionPageProps {
  params: { region: string };
}

export async function generateStaticParams() {
  return VALID_REGIONS.map((region) => ({ region }));
}

export async function generateMetadata({ params }: RegionPageProps): Promise<Metadata> {
  const region = params.region?.toLowerCase();
  const label = REGION_LABELS[region];
  if (!label) return { title: 'Region Not Found' };

  const canonical = `${BASE_URL}/chinese-buffets/regions/${region}`;

  return {
    title: `Chinese Buffets in the ${label} - All-You-Can-Eat Directory`,
    description: `Find Chinese buffets across the ${label} United States. Browse by state for all-you-can-eat Chinese buffets.`,
    alternates: { canonical },
    robots: { index: true, follow: true },
  };
}

export default async function RegionPage({ params }: RegionPageProps) {
  const region = params.region?.toLowerCase();
  const stateAbbrs = region ? REGION_STATES[region] : null;
  const label = region ? REGION_LABELS[region] : null;

  if (!stateAbbrs || !label) notFound();

  const otherRegions = VALID_REGIONS.filter((r) => r !== region);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="text-sm text-[var(--muted)] mb-6">
          <Link href="/" className="hover:text-[var(--accent1)]">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/chinese-buffets/states" className="hover:text-[var(--accent1)]">States</Link>
          <span className="mx-2">/</span>
          <span className="text-[var(--text)]">{label}</span>
        </nav>

        <header className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--text)] mb-3">
            Chinese Buffets in the {label}
          </h1>
          <p className="text-[var(--muted)] text-lg leading-relaxed max-w-2xl">
            Browse Chinese buffets by state in the {label} United States. Each state page lists cities and buffets with hours, ratings, and directions.
          </p>
        </header>

        {/* States grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {stateAbbrs.map((abbr) => (
            <Link
              key={abbr}
              href={`/chinese-buffets/states/${abbr.toLowerCase()}`}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--text)] hover:border-[var(--accent1)] hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-2 text-center"
            >
              {STATE_ABBR_TO_NAME[abbr] || abbr}
            </Link>
          ))}
        </div>

        {/* Other regions */}
        <section className="mt-10">
          <h2 className="text-xl font-semibold text-[var(--text)] mb-4">Other regions</h2>
          <ul className="flex flex-wrap gap-3">
            {otherRegions.map((r) => (
              <li key={r}>
                <Link
                  href={`/chinese-buffets/regions/${r}`}
                  className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:border-[var(--accent1)] hover:text-[var(--accent1)] transition-colors"
                >
                  {REGION_LABELS[r]}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Back navigation */}
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[var(--accent1)] font-medium hover:underline"
          >
            ← Home
          </Link>
          <span className="text-[var(--muted)]">|</span>
          <Link
            href="/chinese-buffets/states"
            className="text-[var(--accent1)] font-medium hover:underline"
          >
            All states →
          </Link>
        </div>
      </div>
    </div>
  );
}
