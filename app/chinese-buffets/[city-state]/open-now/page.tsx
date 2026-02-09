import { Metadata } from 'next';
import { buildFilterMetadata, CityFilterPageShell } from '@/lib/city-filter-pages';

export const revalidate = 21600;

interface Props {
  params: { 'city-state': string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return buildFilterMetadata(params['city-state'], 'open-now');
}

export default async function OpenNowPage({ params }: Props) {
  return <CityFilterPageShell citySlug={params['city-state']} filter="open-now" />;
}
