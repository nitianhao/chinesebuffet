import React from 'react';
import { getHeroSummary } from '@/lib/summaryUtils';
import ActionButton from '@/components/ui/ActionButton';
import SignatureCard from '@/components/ui/SignatureCard';

interface BuffetHeroHeaderProps {
  buffet: {
    name: string;
    rating?: number | null;
    reviewsCount?: number | null;
    price?: string | null;
    categories?: string[] | null;
    address?: { street?: string; city?: string; state?: string; postalCode?: string } | string | null;
    cityName?: string | null;
    neighborhood?: string | null;
    location?: { lat: number; lng: number } | null;
    imageCount?: number;
    imagesCount?: number;
    contactInfo?: { phone?: string; website?: string; menuUrl?: string } | null;
    reviewSummaryParagraph1?: string | null;
    description2?: string | null;
    description?: string | null;
  };
  openStatus: string | null;
}

const StarIcon = () => (
  <svg className="w-5 h-5 text-amber-500 fill-current flex-shrink-0" viewBox="0 0 20 20" aria-hidden>
    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
  </svg>
);

const KeyFactIcon = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <span className={`text-[var(--muted)] flex-shrink-0 ${className}`} aria-hidden>
    {children}
  </span>
);

export default function BuffetHeroHeader({ buffet, openStatus }: BuffetHeroHeaderProps) {
  const heroSummary = getHeroSummary(buffet);
  const hasPhotos = Array.isArray(buffet.images) && buffet.images.length > 0;
  const cuisineTypes = (buffet.categories || [])
    .filter((c: string) => !/restaurant|buffet/i.test(c))
    .slice(0, 2);
  const cuisineLabel = cuisineTypes.length > 0 ? cuisineTypes.join(', ') : 'Chinese buffet';
  const locationCue =
    buffet.neighborhood ||
    (typeof buffet.address === 'object' && buffet.address?.city
      ? buffet.address.city
      : buffet.cityName) ||
    '';

  return (
    <SignatureCard minimal className="page-block-gap">
      {/* 1. H1 - Buffet name only */}
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-[var(--text)] mb-2">
        {buffet.name}
      </h1>

      {/* 2. Star rating + review count - prominent (Yelp/Google Maps style) */}
      {(buffet.rating != null && buffet.reviewsCount != null) && (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <StarIcon />
            <span className="text-lg font-semibold text-[var(--text)]">
              {buffet.rating.toFixed(1)}
            </span>
          </div>
          <span className="text-[var(--muted)] text-sm">
            ({buffet.reviewsCount >= 1000
              ? `${(buffet.reviewsCount / 1000).toFixed(1)}k`
              : buffet.reviewsCount.toLocaleString()}{' '}
            reviews)
          </span>
        </div>
      )}

      {/* 3. Human-friendly summary (1–2 lines) */}
      {heroSummary && (
        <p className="text-sm md:text-base text-[var(--text-secondary)] leading-snug mb-4 line-clamp-2">
          {heroSummary}
        </p>
      )}

      {/* 4. Primary + Secondary CTAs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {buffet.location?.lat && buffet.location?.lng && (
          <ActionButton
            variant="primary"
            href={`https://www.google.com/maps/dir/?api=1&destination=${buffet.location.lat},${buffet.location.lng}`}
            external
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
          >
            Get Directions
          </ActionButton>
        )}
        {hasPhotos && (
          <ActionButton
            variant="secondary"
            href="#photos"
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
          >
            View Photos
          </ActionButton>
        )}
      </div>

      {/* 5. Key facts row - icons + short text */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--text-secondary)] border-t border-[var(--border)] pt-3">
        {buffet.price && (
          <div className="flex items-center gap-2">
            <KeyFactIcon>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </KeyFactIcon>
            <span>{buffet.price}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <KeyFactIcon>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </KeyFactIcon>
          <span>{cuisineLabel}</span>
        </div>
        {openStatus && (
          <div className="flex items-center gap-2">
            <KeyFactIcon>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </KeyFactIcon>
            <span
              className={
                openStatus === 'Closed'
                  ? 'text-red-600 font-medium'
                  : 'text-emerald-600 font-medium'
              }
            >
              {openStatus === 'Closed' ? 'Closed now' : 'Open now'}
            </span>
          </div>
        )}
        {locationCue && (
          <div className="flex items-center gap-2">
            <KeyFactIcon>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </KeyFactIcon>
            <span>{locationCue}</span>
          </div>
        )}
      </div>
    </SignatureCard>
  );
}
