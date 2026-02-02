'use client';

import React, { useState } from 'react';

interface AccordionProps {
  title: string | React.ReactNode;
  summary?: string | React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  variant?: 'default' | 'compact';
  className?: string;
}

/**
 * Accordion - Progressive disclosure component
 * Features: accessible, keyboard navigable, smooth animation
 */
export default function Accordion({
  title,
  summary,
  icon,
  children,
  defaultExpanded = false,
  variant = 'default',
  className = '',
}: AccordionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const compactMode = variant === 'compact';

  return (
    <div className={`bg-white rounded-xl ring-1 ring-black/5 overflow-hidden ${className}`}>
      <button
        onClick={toggleExpanded}
        aria-expanded={isExpanded}
        className={`w-full text-left flex items-center justify-between gap-3 transition-colors hover:bg-neutral-50 ${
          compactMode ? 'px-3 py-2.5' : 'px-4 py-3'
        }`}
      >
        <div className="flex-1 min-w-0 flex items-center gap-2.5">
          {icon && (
            <span className="flex-shrink-0 text-[var(--accent1)]">
              {icon}
            </span>
          )}
          <div>
            <div className={`font-medium text-neutral-900 ${compactMode ? 'text-sm' : 'text-base'}`}>
              {title}
            </div>
          {summary && !isExpanded && (
            <div className={`text-neutral-600 truncate ${compactMode ? 'text-xs mt-0.5' : 'text-sm mt-1'}`}>
              {summary}
            </div>
          )}
          </div>
        </div>
        <svg
          className={`flex-shrink-0 transition-transform ${compactMode ? 'w-4 h-4' : 'w-5 h-5'} text-neutral-400 ${
            isExpanded ? 'transform rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isExpanded && (
        <div className={`border-t border-neutral-200 ${compactMode ? 'px-3 py-2.5' : 'px-4 py-3'} bg-white`}>
          {children}
        </div>
      )}
    </div>
  );
}
