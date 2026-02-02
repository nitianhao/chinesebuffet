'use client';

import { useEffect, useState } from 'react';

interface MobileActionBarProps {
  buffet: {
    name?: string;
    address?: string | { street?: string; city?: string; state?: string; full?: string };
    location?: { lat: number; lng: number };
    contactInfo?: { phone?: string };
    phone?: string;
    phoneUnformatted?: string;
  };
}

/** Scroll threshold: show bar after scrolling past header (~56–64px + hero) */
const SCROLL_THRESHOLD = 280;

export default function MobileActionBar({ buffet }: MobileActionBarProps) {
  const [visible, setVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);

    const handleScroll = () => {
      const scrollY = typeof window !== 'undefined' ? window.scrollY || window.pageYOffset : 0;
      setVisible(scrollY > SCROLL_THRESHOLD);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  if (!isMobile || !visible) return null;

  const phone = buffet.contactInfo?.phone || buffet.phone || buffet.phoneUnformatted;
  const phoneUnformatted = buffet.phoneUnformatted || phone?.replace(/\D/g, '') || '';

  const getAddressString = (): string => {
    if (!buffet.address) return '';
    if (typeof buffet.address === 'string') return buffet.address;
    if (buffet.address.full) return buffet.address.full;
    const parts: string[] = [];
    if (buffet.address.street) parts.push(buffet.address.street);
    if (buffet.address.city && buffet.address.state) {
      parts.push(`${buffet.address.city}, ${buffet.address.state}`);
    } else if (buffet.address.city) parts.push(buffet.address.city);
    return parts.join(', ');
  };

  const addressString = getAddressString();

  const getDirectionsUrl = (): string => {
    if (buffet.location?.lat && buffet.location?.lng) {
      return `https://www.google.com/maps/dir/?api=1&destination=${buffet.location.lat},${buffet.location.lng}`;
    }
    if (addressString) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressString)}`;
    }
    return '#';
  };

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const title = buffet.name ? `${buffet.name} - Chinese Buffet` : 'Chinese Buffet';
    const text = buffet.name ? `Check out ${buffet.name}` : '';

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          await navigator.clipboard?.writeText(url);
        }
      }
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    }
  };

  const hasDirections = addressString || (buffet.location?.lat && buffet.location?.lng);
  const hasCall = !!phone;

  /* Show bar if we have at least Directions or Call; Share is always available */
  if (!hasDirections && !hasCall) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9998] md:hidden
        bg-[#0B0B0C] border-t border-white/10 shadow-[0_-4px_24px_rgba(0,0,0,0.4)]
        pb-[env(safe-area-inset-bottom)]"
      role="toolbar"
      aria-label="Quick actions"
    >
      <div className="flex items-stretch gap-1 px-3 py-3 min-h-[56px]">
        {/* Directions - Primary */}
        {hasDirections && (
          <a
            href={getDirectionsUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 min-h-[48px] px-4
              bg-gradient-to-r from-[#C1121F] to-[#7F0A12] text-white font-semibold text-base
              rounded-xl shadow-lg active:scale-[0.98] transition-transform
              touch-manipulation select-none"
          >
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <span>Directions</span>
          </a>
        )}

        {/* Call */}
        {hasCall && (
          <a
            href={`tel:${phoneUnformatted}`}
            className="flex items-center justify-center min-w-[56px] min-h-[48px] px-4
              bg-white/10 text-white font-medium rounded-xl
              border border-white/20 hover:bg-white/15 active:scale-[0.98] transition-all
              touch-manipulation select-none"
            aria-label="Call"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </a>
        )}

        {/* Share */}
        <button
          type="button"
          onClick={handleShare}
          className="flex items-center justify-center min-w-[56px] min-h-[48px] px-4
            bg-white/10 text-white font-medium rounded-xl
            border border-white/20 hover:bg-white/15 active:scale-[0.98] transition-all
            touch-manipulation select-none"
          aria-label="Share"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
