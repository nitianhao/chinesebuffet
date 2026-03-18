import DisclosureCard from '@/components/ui/DisclosureCard';
import { computeLocationVibe } from '@/lib/locationVibe';

interface LocationVibeSectionProps {
  buffet: any;
}

export default function LocationVibeSection({ buffet }: LocationVibeSectionProps) {
  const vibe = computeLocationVibe(buffet);

  if (vibe.nearbyTotalCount === 0) return null;

  const { locationVibe, locationVibeEmoji, locationVibeDescription, categoryBreakdown, dominantCategory } = vibe;

  // Sort categories by count descending, take top 6 for the breakdown bar
  const sorted = Object.entries(categoryBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const maxCount = sorted[0]?.[1] ?? 1;

  return (
    <DisclosureCard
      title={
        <span className="flex items-center gap-2">
          <span>{locationVibeEmoji}</span>
          <span>{locationVibe}</span>
        </span>
      }
      summary={locationVibeDescription}
      defaultOpen
      titleAs="h2"
      className="page-block-gap"
      icon={null}
    >
      <div className="space-y-5">
        {/* One-line description */}
        <p className="text-sm text-[var(--muted)]">{locationVibeDescription}</p>

        {/* Category breakdown */}
        <div className="space-y-2.5">
          {sorted.map(([cat, count]) => {
            const pct = Math.round((count / maxCount) * 100);
            const isDominant = cat === dominantCategory;
            return (
              <div key={cat} className="flex items-center gap-3">
                <span
                  className={`text-xs w-40 shrink-0 truncate ${isDominant ? 'font-semibold text-[var(--text)]' : 'text-[var(--muted)]'}`}
                  title={cat}
                >
                  {cat}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-[var(--border)]">
                  <div
                    className="h-1.5 rounded-full bg-[var(--accent1)]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-[var(--muted)] w-6 text-right tabular-nums shrink-0">
                  {count}
                </span>
              </div>
            );
          })}
        </div>

        {/* Total count footnote */}
        <p className="text-xs text-[var(--muted)]">
          {vibe.nearbyTotalCount} nearby places across {Object.keys(categoryBreakdown).length} categories
        </p>
      </div>
    </DisclosureCard>
  );
}
