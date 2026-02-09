'use client';

import { useState, Children } from 'react';

interface ExpandableListProps {
  /** Pre-rendered list items (avoids passing functions across server/client boundary) */
  children: React.ReactNode;
  /** Max items shown when collapsed (when item count > showButtonThreshold) */
  collapsedCount?: number;
  /** Show "Show more" button only when item count > this */
  showButtonThreshold?: number;
  showMoreText?: string;
  className?: string;
}

/**
 * Small client island: expand/collapse list with "Show more" button.
 * Accepts pre-rendered children so Server Components can use it without passing functions.
 */
export default function ExpandableList({
  children,
  collapsedCount = 3,
  showButtonThreshold = 4,
  showMoreText,
  className = '',
}: ExpandableListProps) {
  const [expanded, setExpanded] = useState(false);
  const items = Children.toArray(children);
  const hasMore = items.length > showButtonThreshold;
  const visibleItems = expanded || !hasMore
    ? items
    : items.slice(0, collapsedCount);
  const hiddenCount = items.length - collapsedCount;

  return (
    <div className={className}>
      {visibleItems}
      {hasMore && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-sm text-[var(--accent1)] hover:text-[var(--accent1)] hover:underline font-medium mt-2"
        >
          {showMoreText ?? `Show ${hiddenCount} more`}
        </button>
      )}
    </div>
  );
}
