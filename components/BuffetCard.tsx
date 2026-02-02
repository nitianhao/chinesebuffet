import Link from 'next/link';
import { formatAddress, formatPhoneNumber } from '@/lib/utils';
import { Buffet } from '@/lib/data';

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
    <div className="border border-[var(--border)] rounded-lg p-6 hover:shadow-lg transition-shadow bg-[var(--surface)] hover:border-[var(--accent1)]">
      <div className="flex justify-between items-start mb-3">
        <Link
          href={`/chinese-buffets/${citySlug}/${buffet.slug}`}
          className="text-xl font-semibold text-[var(--accent1)] hover:opacity-80"
        >
          {buffet.name}
        </Link>
        {buffet.rating > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-yellow-500">⭐</span>
            <span className="font-semibold text-[var(--text)]">{buffet.rating.toFixed(1)}</span>
            {buffet.reviewsCount > 0 && (
              <span className="text-[var(--muted)] text-sm">
                ({buffet.reviewsCount.toLocaleString()})
              </span>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2 text-[var(--text-secondary)]">
        <p className="text-sm">
          {formatAddress(buffet.address)}
        </p>

        {buffet.phone && (
          <p className="text-sm">
            📞 {formatPhoneNumber(buffet.phone)}
          </p>
        )}

        {buffet.price && (
          <p className="text-sm font-medium text-emerald-700">
            💰 {buffet.price}
          </p>
        )}

        {showDistance && distance !== undefined && (
          <p className="text-sm text-[var(--muted)]">
            📍 {distance.toFixed(1)} miles away
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
          className="text-[var(--accent1)] hover:opacity-80 text-sm font-medium"
        >
          View Details →
        </Link>
      </div>
    </div>
  );
}

