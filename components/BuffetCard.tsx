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
    <div className="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <Link
          href={`/chinese-buffets/${citySlug}/${buffet.slug}`}
          className="text-xl font-semibold text-blue-600 hover:text-blue-800"
        >
          {buffet.name}
        </Link>
        {buffet.rating > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-yellow-500">⭐</span>
            <span className="font-semibold">{buffet.rating.toFixed(1)}</span>
            {buffet.reviewsCount > 0 && (
              <span className="text-gray-500 text-sm">
                ({buffet.reviewsCount.toLocaleString()})
              </span>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2 text-gray-700">
        <p className="text-sm">
          {formatAddress(buffet.address)}
        </p>

        {buffet.phone && (
          <p className="text-sm">
            📞 {formatPhoneNumber(buffet.phone)}
          </p>
        )}

        {buffet.price && (
          <p className="text-sm font-medium text-green-700">
            💰 {buffet.price}
          </p>
        )}

        {showDistance && distance !== undefined && (
          <p className="text-sm text-gray-600">
            📍 {distance.toFixed(1)} miles away
          </p>
        )}

        {buffet.hours && buffet.hours.length > 0 && (
          <div className="text-sm">
            <p className="font-medium mb-1">Hours:</p>
            <div className="text-gray-600">
              {buffet.hours.slice(0, 2).map((h, i) => (
                <p key={i} className="text-xs">
                  {h.day}: {h.hours}
                </p>
              ))}
              {buffet.hours.length > 2 && (
                <p className="text-xs text-gray-500">
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
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          View Details →
        </Link>
      </div>
    </div>
  );
}

