'use client';

import { useState } from 'react';
import DisclosureCard from '@/components/ui/DisclosureCard';

export interface YelpMenuItem {
  name: string;
  price?: string | null;
  description?: string | null;
}

interface YelpMenuSectionProps {
  items: YelpMenuItem[] | null | undefined;
}

const INITIAL_COUNT = 24;

export default function YelpMenuSection({ items }: YelpMenuSectionProps) {
  const [expanded, setExpanded] = useState(false);

  const cleaned = (items ?? [])
    .filter((it) => it && typeof it.name === 'string' && it.name.trim())
    .map((it) => ({
      name: it.name.trim(),
      price: it.price?.trim() || null,
      description: it.description?.trim() || null,
    }));

  if (cleaned.length === 0) return null;

  const visible = expanded ? cleaned : cleaned.slice(0, INITIAL_COUNT);
  const remaining = cleaned.length - visible.length;

  return (
    <DisclosureCard
      title="Full Menu"
      summary={`${cleaned.length} item${cleaned.length !== 1 ? 's' : ''} with prices`}
      defaultOpen={false}
      titleAs="h2"
      className="page-block-gap"
      icon={
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      }
    >
      <ul className="divide-y divide-[var(--border)]">
        {visible.map((item, i) => (
          <li key={`${item.name}-${i}`} className="py-3 first:pt-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-[var(--text)]">{item.name}</span>
              {item.price && (
                <span className="text-sm tabular-nums text-[var(--text-secondary)] flex-shrink-0">{item.price}</span>
              )}
            </div>
            {item.description && (
              <p className="mt-1 text-xs text-[var(--muted)] leading-relaxed">{item.description}</p>
            )}
          </li>
        ))}
      </ul>

      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface2)] transition-colors"
        >
          Show all {cleaned.length} items
        </button>
      )}

      <p className="mt-3 text-[11px] text-[var(--muted)]">Menu sourced from Yelp; items and prices may change.</p>
    </DisclosureCard>
  );
}
