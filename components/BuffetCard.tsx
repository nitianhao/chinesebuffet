import Link from 'next/link';
import { formatAddress, formatPhoneNumber } from '@/lib/utils';
import { Buffet } from '@/lib/data';
import SaveButton from '@/components/saved/SaveButton';

interface BuffetCardProps {
  buffet: Buffet;
  citySlug: string;
  showDistance?: boolean;
  distance?: number;
}

export default function BuffetCard({
  buffet,
  citySlug,
  showDistance = false,
  distance,
}: BuffetCardProps) {
  return (
    <div className="border border-[var(--border)] rounded-lg p-6 hover:shadow-lg transition-shadow bg-[var(--surface)] hover:border-[var(--accent1)] relative">
      <div className="flex items-start justify-between gap-3 mb-3">
        <Link
          href={`/chinese-buffets/${citySlug}/${buffet.slug}`}
          className="text-xl font-semibold text-[var(--accent1)] hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F] focus-visible:ring-offset-2 rounded-sm"
        >
          {buffet.name}
        </Link>
        <div className="flex items-center gap-2">
          {buffet.rating > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-yellow-500" aria-hidden="true">⭐</span>
              <span className="sr-only">Rating</span>
              <span className="font-semibold text-[var(--text)]">{buffet.rating.toFixed(1)}</span>
              {buffet.reviewsCount > 0 && (
                <span className="text-[var(--muted)] text-sm">
                  ({buffet.reviewsCount.toLocaleString()})
                </span>
              )}
            </div>
          )}
          <SaveButton
            item={{
              slug: buffet.slug,
              citySlug,
              name: buffet.name,
              city: buffet.address.city,
              stateAbbr: buffet.address.stateAbbr,
              rating: buffet.rating,
              reviewCount: buffet.reviewsCount,
              price: buffet.price,
            }}
          />
        </div>
      </div>

      <div className="space-y-2 text-[var(--text-secondary)]">
        <p className="text-sm break-words">
          {formatAddress(buffet.address)}
        </p>

        {buffet.phone && (
          <p className="text-sm">
            <span aria-hidden="true">📞</span> <span className="sr-only">Phone</span>{' '}
            {formatPhoneNumber(buffet.phone)}
          </p>
        )}

        {buffet.price && (
          <p className="text-sm font-medium text-emerald-700">
            <span aria-hidden="true">💰</span> <span className="sr-only">Price</span> {buffet.price}
          </p>
        )}

        {showDistance && distance !== undefined && (
          <p className="text-sm text-[var(--muted)]">
            <span aria-hidden="true">📍</span> <span className="sr-only">Distance</span>{' '}
            {distance.toFixed(1)} miles away
          </p>
        )}

        {buffet.hours && buffet.hours.length > 0 && (
          <div className="text-sm">
            <p className="font-medium mb-1 text-[var(--text)]">Hours:</p>
            <div className="text-[var(--muted)]">
              {buffet.hours.slice(0, 2).map((h, i) => (
                <p key={i} className="text-xs">
                  {h.day}: {h.hours}
                </p>
              ))}
              {buffet.hours.length > 2 && (
                <p className="text-xs text-[var(--muted-light)]">
                  +{buffet.hours.length - 2} more days
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4">
        <Link
          href={`/chinese-buffets/${citySlug}/${buffet.slug}`}
          className="text-[var(--accent1)] hover:opacity-80 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F] focus-visible:ring-offset-2 rounded-sm"
        >
          View Details →
        </Link>
      </div>
    </div>
  );
}

