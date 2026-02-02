'use client';

import { useState } from 'react';

export interface ChipItem {
  label: string;
  available: boolean;
  icon?: React.ReactNode;
}

interface ChipGridWithExpandProps {
  items: ChipItem[];
  /** Number of items to show before "Show all" (default: 6) */
  initialCount?: number;
  /** Variant for available items */
  availableVariant?: 'success' | 'default';
  /** Optional icon for all available items */
  availableIcon?: React.ReactNode;
  /** Optional icon for all unavailable items */
  unavailableIcon?: React.ReactNode;
  className?: string;
}

const defaultAvailableIcon = (
  <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const defaultUnavailableIcon = (
  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

/**
 * ChipGridWithExpand - Mobile-first chip grid with "Show all" expansion
 * - Responsive grid (2 cols mobile, 3–4 cols tablet+)
 * - Shows top 6–8 items by default
 * - Expands to show all on tap
 * - Maintains schema compatibility (all data rendered)
 */
export default function ChipGridWithExpand({
  items,
  initialCount = 6,
  availableVariant = 'success',
  availableIcon = defaultAvailableIcon,
  unavailableIcon = defaultUnavailableIcon,
  className = '',
}: ChipGridWithExpandProps) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = items.length > initialCount;
  const visibleItems = expanded ? items : items.slice(0, initialCount);

  if (items.length === 0) return null;

  return (
    <div className={className}>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {visibleItems.map((item, index) => (
          <span
            key={`${item.label}-${index}`}
            className={`
              inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
              min-h-[44px] touch-manipulation
              ${item.available
                ? availableVariant === 'success'
                  ? 'bg-emerald-50/80 text-emerald-800 ring-1 ring-emerald-200/60'
                  : 'bg-[var(--surface)] text-[var(--text)] ring-1 ring-[var(--border)]'
                : 'bg-gray-50 text-gray-500 ring-1 ring-gray-200'
              }
            `}
          >
            {item.icon ?? (item.available ? availableIcon : unavailableIcon)}
            <span className="truncate">{item.label}</span>
          </span>
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-3 w-full sm:w-auto px-4 py-2 text-sm font-medium text-[var(--accent1)] hover:bg-[var(--accent1)]/5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-2"
          aria-expanded={expanded}
        >
          {expanded ? 'Show less' : `Show all (${items.length})`}
        </button>
      )}
    </div>
  );
}
