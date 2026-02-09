import React from 'react';

type DisclosureCardSize = 'default' | 'compact';

interface DisclosureCardProps {
  title: string | React.ReactNode;
  summary?: string | React.ReactNode;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  minimal?: boolean;
  size?: DisclosureCardSize;
  titleAs?: 'h2' | 'h3' | 'div';
  className?: string;
  summaryClassName?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

export default function DisclosureCard({
  title,
  summary,
  icon,
  defaultOpen = false,
  minimal = true,
  size = 'default',
  titleAs = 'h2',
  className = '',
  summaryClassName = '',
  contentClassName = '',
  children,
}: DisclosureCardProps) {
  const TitleTag = titleAs;
  const isCompact = size === 'compact';
  const baseClasses = minimal
    ? 'relative bg-transparent rounded-[var(--radius-xl)] overflow-hidden'
    : 'relative bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-soft)] overflow-hidden';
  const padding = isCompact ? 'px-3 py-2.5' : 'px-4 md:px-5 py-3 md:py-4';
  const contentPadding = isCompact ? 'px-3 py-2.5' : 'px-4 md:px-5 py-4 md:py-5';
  const dividerClass = minimal ? 'border-[var(--border)]/60' : 'border-[var(--border)]';

  return (
    <details className={`group ${baseClasses} ${className}`} open={defaultOpen}>
      <summary
        className={`list-none cursor-pointer select-none ${padding} ${summaryClassName} flex items-start justify-between gap-3 marker:hidden [-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F] focus-visible:ring-offset-2`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {icon && <span className="text-[var(--muted)]">{icon}</span>}
            <TitleTag className={`${isCompact ? 'text-sm' : 'text-base'} font-semibold text-[var(--text)]`}>
              {title}
            </TitleTag>
          </div>
          {summary && (
            <div
              className={`mt-1 text-[var(--muted)] ${isCompact ? 'text-xs' : 'text-sm'} line-clamp-1 group-open:hidden`}
            >
              {summary}
            </div>
          )}
        </div>
        <svg
          className={`flex-shrink-0 ${isCompact ? 'h-4 w-4' : 'h-5 w-5'} text-[var(--muted)] transition-transform group-open:rotate-180`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className={`border-t ${dividerClass} ${contentPadding} ${contentClassName}`}>{children}</div>
    </details>
  );
}
