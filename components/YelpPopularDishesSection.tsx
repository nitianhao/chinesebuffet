import DisclosureCard from '@/components/ui/DisclosureCard';

export interface YelpPopularDish {
  name: string;
  price?: string | null;
  count?: number | null;
}

interface YelpPopularDishesSectionProps {
  dishes: YelpPopularDish[] | null | undefined;
}

export default function YelpPopularDishesSection({ dishes }: YelpPopularDishesSectionProps) {
  const cleaned = (dishes ?? [])
    .filter((d) => d && typeof d.name === 'string' && d.name.trim())
    .map((d) => ({ name: d.name.trim(), price: d.price?.trim() || null, count: typeof d.count === 'number' ? d.count : null }))
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

  if (cleaned.length === 0) return null;

  return (
    <DisclosureCard
      title="Popular Dishes"
      summary={`${cleaned.length} dish${cleaned.length !== 1 ? 'es' : ''} reviewers mention most`}
      defaultOpen
      titleAs="h2"
      className="page-block-gap"
      icon={
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      }
    >
      <ul className="divide-y divide-[var(--border)]">
        {cleaned.map((dish) => (
          <li key={dish.name} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
            <span className="text-sm font-medium text-[var(--text)]">{dish.name}</span>
            <span className="flex items-center gap-2 flex-shrink-0">
              {dish.price && (
                <span className="text-sm tabular-nums text-[var(--text-secondary)]">{dish.price}</span>
              )}
              {dish.count != null && dish.count > 0 && (
                <span className="rounded-full bg-amber-50 ring-1 ring-amber-200 px-2 py-0.5 text-xs font-medium text-amber-700 tabular-nums">
                  {dish.count} {dish.count === 1 ? 'mention' : 'mentions'}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-[var(--muted)]">Dishes most frequently mentioned in Yelp reviews.</p>
    </DisclosureCard>
  );
}
