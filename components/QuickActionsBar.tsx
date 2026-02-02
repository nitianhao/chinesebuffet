'use client';

import { useEffect, useState } from 'react';

interface QuickActionsBarProps {
  buffet: {
    name?: string;
    address?: string | {
      street?: string;
      city?: string;
      state?: string;
      full?: string;
    };
    location?: {
      lat: number;
      lng: number;
    };
    contactInfo?: {
      phone?: string;
      menuUrl?: string;
    };
    phone?: string;
    phoneUnformatted?: string;
    reviewsCount?: number;
  };
}

export default function QuickActionsBar({ buffet }: QuickActionsBarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check if mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);

    // Handle scroll to show/hide bar
    const handleScroll = () => {
      // Show bar after scrolling past 400px (past the header)
      const scrollY = window.scrollY || window.pageYOffset;
      setIsVisible(scrollY > 400);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // Initial check
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  if (!isVisible) return null;

  // Get phone number
  const phone = buffet.contactInfo?.phone || buffet.phone || buffet.phoneUnformatted;
  const phoneUnformatted = buffet.phoneUnformatted || phone?.replace(/\D/g, '') || '';

  // Get address for directions
  const getAddressString = (): string => {
    if (!buffet.address) return '';
    if (typeof buffet.address === 'string') return buffet.address;
    if (buffet.address.full) return buffet.address.full;
    const parts: string[] = [];
    if (buffet.address.street) parts.push(buffet.address.street);
    if (buffet.address.city && buffet.address.state) {
      parts.push(`${buffet.address.city}, ${buffet.address.state}`);
    } else if (buffet.address.city) {
      parts.push(buffet.address.city);
    }
    return parts.join(', ');
  };

  const addressString = getAddressString();

  // Build Google Maps directions URL
  const getDirectionsUrl = (): string => {
    if (buffet.location?.lat && buffet.location?.lng) {
      return `https://www.google.com/maps/dir/?api=1&destination=${buffet.location.lat},${buffet.location.lng}`;
    }
    if (addressString) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressString)}`;
    }
    return '#';
  };

  const menuUrl = buffet.contactInfo?.menuUrl;
  const hasReviews = buffet.reviewsCount && buffet.reviewsCount > 0;

  // Mobile: Bottom sticky bar
  if (isMobile) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg md:hidden">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-around gap-2">
            {/* Directions */}
            {addressString && (
              <a
                href={getDirectionsUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1 px-3 py-2 text-gray-700 hover:text-[#C1121F] transition-colors min-w-0 flex-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <span className="text-xs font-medium">Directions</span>
              </a>
            )}

            {/* Call */}
            {phone && (
              <a
                href={`tel:${phoneUnformatted}`}
                className="flex flex-col items-center gap-1 px-3 py-2 text-gray-700 hover:text-green-600 transition-colors min-w-0 flex-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span className="text-xs font-medium">Call</span>
              </a>
            )}

            {/* View Menu */}
            {menuUrl && (
              <a
                href={typeof menuUrl === 'string' ? menuUrl : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-1 px-3 py-2 text-gray-700 hover:text-[var(--accent1)] transition-colors min-w-0 flex-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-xs font-medium">Menu</span>
              </a>
            )}

            {/* Reviews */}
            {hasReviews && (
              <a
                href="#reviews"
                className="flex flex-col items-center gap-1 px-3 py-2 text-gray-700 hover:text-yellow-600 transition-colors min-w-0 flex-1"
                onClick={(e) => {
                  e.preventDefault();
                  const reviewsSection = document.getElementById('reviews');
                  if (reviewsSection) {
                    const offset = 80; // Account for sticky header
                    const elementPosition = reviewsSection.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - offset;
                    window.scrollTo({
                      top: offsetPosition,
                      behavior: 'smooth'
                    });
                  }
                }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                <span className="text-xs font-medium">Reviews</span>
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Desktop: Right-side floating action bar
  return (
    <div className="hidden md:block fixed right-4 top-1/2 -translate-y-1/2 z-40" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
      <div className="bg-white rounded-lg border border-gray-200 shadow-lg p-2 max-h-full overflow-y-auto">
        <div className="flex flex-col gap-2">
          {/* Directions */}
          {addressString && (
            <a
              href={getDirectionsUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-3 text-gray-700 hover:text-[#C1121F] hover:bg-[#C1121F]/5 rounded-lg transition-colors group"
              title="Get directions"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <span className="text-sm font-medium whitespace-nowrap">Directions</span>
            </a>
          )}

          {/* Call */}
          {phone && (
            <a
              href={`tel:${phoneUnformatted}`}
              className="flex items-center gap-2 px-4 py-3 text-gray-700 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors group"
              title="Call restaurant"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span className="text-sm font-medium whitespace-nowrap">Call</span>
            </a>
          )}

          {/* View Menu */}
          {menuUrl && (
            <a
              href={typeof menuUrl === 'string' ? menuUrl : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-3 text-gray-700 hover:text-[var(--accent1)] hover:bg-[var(--surface2)] rounded-lg transition-colors group"
              title="View menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm font-medium whitespace-nowrap">Menu</span>
            </a>
          )}

          {/* Reviews */}
          {hasReviews && (
            <a
              href="#reviews"
              className="flex items-center gap-2 px-4 py-3 text-gray-700 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors group"
              title="View reviews"
              onClick={(e) => {
                e.preventDefault();
                const reviewsSection = document.getElementById('reviews');
                if (reviewsSection) {
                  const offset = 80; // Account for sticky header
                  const elementPosition = reviewsSection.getBoundingClientRect().top;
                  const offsetPosition = elementPosition + window.pageYOffset - offset;
                  window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                  });
                }
              }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              <span className="text-sm font-medium whitespace-nowrap">Reviews</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
