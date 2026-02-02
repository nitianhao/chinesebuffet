import { Metadata } from 'next';
import { createIndexTierConfig, toMetadataRobots } from '@/lib/index-tier';

const PAGE_TYPE = 'home' as const;
const INDEX_TIER = 'tier-1' as const;
const indexTierConfig = createIndexTierConfig(PAGE_TYPE, INDEX_TIER, true, '/');

export const metadata: Metadata = {
  title: 'Chinese Buffets Directory - Find All-You-Can-Eat Chinese Buffets Near You',
  description: 'Discover Chinese buffets across the USA. Find locations, hours, prices, and ratings for all-you-can-eat Chinese buffets in your city.',
  robots: toMetadataRobots(indexTierConfig),
};

export default function HomePage() {
  return null;
}
