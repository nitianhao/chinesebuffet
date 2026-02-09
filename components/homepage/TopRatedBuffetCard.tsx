import Link from 'next/link';
import SaveButton from '@/components/saved/SaveButton';

interface TopRatedBuffetCardProps {
  buffet: {
    name: string;
    slug: string;
    city: string;
    stateAbbr: string;
    rating?: number | null;
    reviewCount?: number | null;
  };
  citySlug: string;
  subtitle?: string;
  thumbUrl?: string;
  thumbAlt?: string;
}

export default function TopRatedBuffetCard({
  buffet,
  citySlug,
  subtitle,
  thumbUrl,
  thumbAlt,
}: TopRatedBuffetCardProps) {
  const ratingValue = buffet.rating ?? 0;
  const reviewCountValue = buffet.reviewCount ?? 0;
  const subtitleText = subtitle ?? `${buffet.city}, ${buffet.stateAbbr}`;
  return (
    <div className="relative h-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 transition-all hover:border-[var(--accent1)] hover:shadow-md">
      <div className="absolute right-3 top-3">
        <SaveButton
          item={{
            slug: buffet.slug,
            citySlug,
            name: buffet.name,
            city: buffet.city,
            stateAbbr: buffet.stateAbbr,
            rating: buffet.rating,
            reviewCount: buffet.reviewCount,
          }}
        />
      </div>
      <Link
        href={`/chinese-buffets/${citySlug}/${buffet.slug}`}
        className="block h-full pr-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F] focus-visible:ring-offset-2"
      >
        <div className="flex h-full flex-col justify-between gap-3">
          <div>
            <div className="flex items-start gap-3">
              {thumbUrl ? (
                <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-md border border-black/5 bg-white/50 dark:border-white/10 dark:bg-white/5">
                  <img
                    src={thumbUrl}
                    alt={thumbAlt || buffet.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : null}
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-snug line-clamp-2 text-[var(--text)]">
                  {buffet.name}
                </div>
                <div className="mt-1 text-sm text-[var(--text-secondary)]">
                  {subtitleText}
                </div>
              </div>
            </div>
          </div>
          <div className="text-sm text-[var(--text-secondary)]">
            <span className="text-[var(--accent1)]">
              <span className="sr-only">Rating</span>★ {ratingValue ? ratingValue.toFixed(1) : '—'}
            </span>
            <span className="ml-2">
              {reviewCountValue.toLocaleString()} reviews
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
