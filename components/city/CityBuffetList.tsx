'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';

// Minimal buffet shape — only the fields the card renders.
// The server strips lat/lng/phone/website/imagesCount to keep the payload small.
interface SlimBuffet {
  id: string;
  slug: string;
  name: string;
  address: string;
  neighborhood: string | null;
  rating: number | null;
  reviewsCount: number | null;
  price: string | null;
}

interface CityBuffetListProps {
  /** Buffets beyond the initial server-rendered batch */
  remaining: SlimBuffet[];
  citySlug: string;
  totalCount: number;
  initialCount: number;
}

/** How many extra cards to reveal per "Load more" click */
const PAGE_SIZE = 12;

function BuffetCardClient({ buffet, citySlug }: { buffet: SlimBuffet; citySlug: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:shadow-md hover:border-[var(--accent1)] transition-all group">
      <Link
        href={`/chinese-buffets/${citySlug}/${buffet.slug}`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F] focus-visible:ring-offset-2 rounded-sm"
      >
        <div className="flex justify-between items-start mb-1">
          <h3 className="font-semibold text-lg text-[var(--text)] group-hover:text-[var(--accent1)] line-clamp-1">
            {buffet.name}
          </h3>
          {buffet.rating != null && buffet.rating > 0 && (
            <span className="flex items-center gap-1 text-sm text-[var(--muted)] shrink-0 ml-2">
              ⭐ {buffet.rating.toFixed(1)}
            </span>
          )}
        </div>
        <p className="text-[var(--muted)] text-sm line-clamp-1 mb-2">{buffet.address}</p>
        <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
          {buffet.neighborhood && (
            <span className="bg-[var(--surface2)] px-2 py-0.5 rounded">{buffet.neighborhood}</span>
          )}
          {buffet.price && (
            <span className="bg-[var(--surface2)] px-2 py-0.5 rounded">{buffet.price}</span>
          )}
          {buffet.reviewsCount != null && buffet.reviewsCount > 0 && (
            <span className="bg-[var(--surface2)] px-2 py-0.5 rounded">
              {buffet.reviewsCount.toLocaleString()} reviews
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}

export default function CityBuffetList({
  remaining,
  citySlug,
  totalCount,
  initialCount,
}: CityBuffetListProps) {
  const [visibleCount, setVisibleCount] = useState(0);

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, remaining.length));
  }, [remaining.length]);

  const visible = remaining.slice(0, visibleCount);
  const shownTotal = initialCount + visibleCount;
  const hasMore = visibleCount < remaining.length;

  return (
    <>
      {visible.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {visible.map((buffet) => (
            <BuffetCardClient key={buffet.id} buffet={buffet} citySlug={citySlug} />
          ))}
        </div>
      )}

      <div className="mt-6 text-center">
        {hasMore ? (
          <button
            type="button"
            onClick={loadMore}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface2)] px-6 py-2.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface)] hover:border-[var(--accent1)] transition-colors"
          >
            Load more ({shownTotal} of {totalCount})
          </button>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Showing all {totalCount} buffets
          </p>
        )}
      </div>
    </>
  );
}
