'use client';

import React, { useState, useRef, useLayoutEffect } from 'react';

interface ShowMoreProps {
  children: React.ReactNode;
  initialLines?: number;
  showMoreText?: string;
  showLessText?: string;
  className?: string;
}

/**
 * ShowMore - Progressive disclosure for long text or lists
 * Features: line clamping, expand/collapse, smooth transition
 * Collapsed by default. Only shows "Show more" when content overflows.
 */
export default function ShowMore({
  children,
  initialLines = 5,
  showMoreText = 'Show more',
  showLessText = 'Show less',
  className = '',
}: ShowMoreProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsExpandButton, setNeedsExpandButton] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el || isExpanded) return;
    // Content overflows when clamped if scrollHeight exceeds clientHeight
    setNeedsExpandButton(el.scrollHeight > el.clientHeight);
  }, [children, initialLines, isExpanded]);

  return (
    <div className={className}>
      <div
        ref={contentRef}
        className="transition-all"
        style={
          isExpanded
            ? undefined
            : {
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: initialLines,
                overflow: 'hidden',
              }
        }
      >
        {children}
      </div>
      {(needsExpandButton || isExpanded) && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 text-sm font-medium text-[var(--accent1)] hover:opacity-80 hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-2 rounded"
        >
          {isExpanded ? showLessText : showMoreText}
        </button>
      )}
    </div>
  );
}
