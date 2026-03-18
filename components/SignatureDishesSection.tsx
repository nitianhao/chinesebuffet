import DisclosureCard from '@/components/ui/DisclosureCard';
import type { SignatureDish } from '@/lib/signatureDishes';

interface SignatureDishesSectionProps {
  dishes: SignatureDish[];
}

export default function SignatureDishesSection({ dishes }: SignatureDishesSectionProps) {
  if (dishes.length === 0) return null;

  const topPicks = dishes.filter((d) => d.isTopPick);
  const others = dishes.filter((d) => !d.isTopPick);

  return (
    <DisclosureCard
      title="Signature Dishes"
      summary={`${dishes.length} popular dish${dishes.length !== 1 ? 'es' : ''} mentioned by diners`}
      defaultOpen
      titleAs="h2"
      className="page-block-gap"
      icon={
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      }
    >
      <div className="space-y-4">
        {topPicks.length > 0 && (
          <div>
            <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide mb-2">
              Top picks
            </p>
            <div className="flex flex-wrap gap-2">
              {topPicks.map((dish) => (
                <DishChip key={dish.name} dish={dish} highlight />
              ))}
            </div>
          </div>
        )}

        {others.length > 0 && (
          <div>
            {topPicks.length > 0 && (
              <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide mb-2">
                Also mentioned
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {others.map((dish) => (
                <DishChip key={dish.name} dish={dish} highlight={false} />
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-[var(--muted)]">
          Extracted from diner reviews and FAQ answers.
        </p>
      </div>
    </DisclosureCard>
  );
}

function DishChip({ dish, highlight }: { dish: SignatureDish; highlight: boolean }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium',
        highlight
          ? 'bg-[var(--accent1)] text-white'
          : 'bg-[var(--surface)] text-[var(--text-secondary)] ring-1 ring-[var(--border)]',
      ].join(' ')}
    >
      {dish.name}
      {dish.price !== undefined && (
        <span className={highlight ? 'opacity-80' : 'text-[var(--muted)]'}>
          · ${dish.price.toFixed(2)}
        </span>
      )}
      {dish.mentionCount > 1 && (
        <span
          className={[
            'text-xs rounded-full px-1.5 py-0.5 tabular-nums',
            highlight
              ? 'bg-white/20'
              : 'bg-[var(--accent-light)] text-[var(--accent1)]',
          ].join(' ')}
        >
          ×{dish.mentionCount}
        </span>
      )}
    </span>
  );
}
