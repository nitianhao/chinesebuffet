import DisclosureCard from '@/components/ui/DisclosureCard';
import { computeTrustedRating, getMedian } from '@/lib/trustedRating';
import type { Buffet } from '@/lib/data';

interface TrustedRatingSectionProps {
  buffet: Buffet;
  cityBuffets: Buffet[];
}

export default function TrustedRatingSection({ buffet, cityBuffets }: TrustedRatingSectionProps) {
  // Compute city baselines (same logic as computeAllTrustedRatings batch helper)
  const totalRating = cityBuffets.reduce((sum, b) => sum + (b.rating ?? 0), 0);
  const cityMeanRating = cityBuffets.length > 0 ? totalRating / cityBuffets.length : buffet.rating ?? 0;
  const rawMedian = getMedian(cityBuffets.map((b) => b.reviewsCount ?? 0));
  const cityMedianReviews = Math.max(50, rawMedian);

  const result = computeTrustedRating(buffet, cityMeanRating, cityMedianReviews);
  const { trustedRatingDisplay, confidenceTier, confidenceTierEmoji, cityAverageRating, cityMedianReviews: m } = result;

  const v = buffet.reviewsCount ?? 0;
  const R = buffet.rating ?? cityMeanRating;

  // The pull: how much the raw rating moved toward the city average
  const pull = Math.abs(R - result.trustedRating);
  const pullDirection = result.trustedRating < R ? 'down' : result.trustedRating > R ? 'up' : null;

  const summary = `${confidenceTierEmoji} ${trustedRatingDisplay} weighted · ${v.toLocaleString()} reviews`;

  return (
    <DisclosureCard
      title={
        <span className="flex items-center gap-2">
          <span aria-hidden>⚖️</span>
          <span>Trusted Rating</span>
        </span>
      }
      summary={summary}
      defaultOpen
      titleAs="h2"
      className="page-block-gap"
      icon={null}
    >
      <div className="space-y-4">
        {/* Score row */}
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-3xl font-bold tabular-nums">{trustedRatingDisplay}</span>
          <span className="text-sm text-[var(--muted)]">
            weighted · raw {R.toFixed(1)} from {v.toLocaleString()} reviews
          </span>
          {pull >= 0.05 && pullDirection && (
            <span className="text-xs text-[var(--muted)]">
              ({pullDirection === 'down' ? '↓' : '↑'} {pull.toFixed(2)} from raw)
            </span>
          )}
        </div>

        {/* Confidence tier badge */}
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>{confidenceTierEmoji}</span>
          <span className="text-sm font-medium">{confidenceTier}</span>
        </div>

        {/* City context bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-[var(--muted)]">
            <span>Review volume vs. city median</span>
            <span>{v.toLocaleString()} / {m.toLocaleString()} median</span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
            <div
              className="h-1.5 rounded-full bg-[var(--accent1)] transition-all"
              style={{ width: `${Math.min(100, Math.round((v / (m * 5)) * 100))}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-[var(--muted)]">
            <span>0</span>
            <span>{(m * 5).toLocaleString()} (Rock Solid threshold)</span>
          </div>
        </div>

        {/* Explainer */}
        <p className="text-xs text-[var(--muted)]">
          The trusted rating blends this place&rsquo;s raw score ({R.toFixed(1)}) with the city
          average ({cityAverageRating.toFixed(2)}) using a Bayesian formula. Places with fewer
          reviews are pulled toward the city mean; places with {m * 5}+ reviews carry their rating
          at nearly full weight.
        </p>
      </div>
    </DisclosureCard>
  );
}
