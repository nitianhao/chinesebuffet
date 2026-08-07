import { Metadata } from 'next';
import { buildFilterMetadata, CityFilterPageShell } from '@/lib/city-filter-pages';
import { getTopCitySlugsForCuisine } from '@/lib/data-instantdb';

// Underlying buffet data only changes via manual import scripts, so a long
// window avoids paying for re-renders/ISR writes a traffic-driven clock
// doesn't actually need.
export const revalidate = 604800; // 7 days

// Pre-render the highest-traffic cities at build time; everything else
// still falls through to on-demand ISR (dynamicParams defaults to true).
export async function generateStaticParams() {
  const slugs = await getTopCitySlugsForCuisine('Chinese', 150);
  return slugs.map((citySlug) => ({ 'city-state': citySlug }));
}

interface Props {
  params: { 'city-state': string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return buildFilterMetadata(params['city-state'], 'open-now');
}

export default async function OpenNowPage({ params }: Props) {
  return <CityFilterPageShell citySlug={params['city-state']} filter="open-now" />;
}
