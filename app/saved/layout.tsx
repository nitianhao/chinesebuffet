import type { Metadata } from 'next';
import { getCanonicalUrl } from '@/lib/site-url';

export const metadata: Metadata = {
  title: 'Saved Buffets',
  description: 'Your saved Chinese buffets. View and manage your saved buffet list.',
  alternates: {
    canonical: getCanonicalUrl('/saved'),
  },
  robots: { index: false, follow: true },
};

export default function SavedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
