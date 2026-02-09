'use client';

import React from 'react';
import { SavedBuffet, useSavedBuffets } from '@/components/saved/useSavedBuffets';

type SaveButtonProps = {
  item: SavedBuffet;
  variant?: 'icon' | 'pill';
  className?: string;
  showLabel?: boolean;
};

export default function SaveButton({
  item,
  variant = 'icon',
  className = '',
  showLabel = false,
}: SaveButtonProps) {
  const { isSaved, toggleSaved } = useSavedBuffets();
  const saved = isSaved(item);

  const base =
    'inline-flex items-center justify-center gap-2 rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F] focus-visible:ring-offset-2';
  const size = variant === 'pill' ? 'min-h-[40px] px-3 text-sm' : 'h-9 w-9';
  const tone = saved
    ? 'border-[#C1121F]/40 bg-[#C1121F]/10 text-[#C1121F]'
    : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--muted)] hover:text-[var(--text)]';

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? 'Remove from saved' : 'Save buffet'}
      onClick={() => toggleSaved(item)}
      className={`${base} ${size} ${tone} ${className}`}
    >
      <svg
        className={variant === 'pill' ? 'h-4 w-4' : 'h-5 w-5'}
        viewBox="0 0 24 24"
        fill={saved ? 'currentColor' : 'none'}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 4h12a1 1 0 011 1v16l-7-4-7 4V5a1 1 0 011-1z"
        />
      </svg>
      {(showLabel || variant === 'pill') && <span>{saved ? 'Saved' : 'Save'}</span>}
    </button>
  );
}
