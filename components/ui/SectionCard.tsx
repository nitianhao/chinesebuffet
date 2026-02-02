import React from 'react';

interface SectionCardProps {
  title?: string;
  description?: string;
  /** Icon to show next to the title */
  titleIcon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
  /** For hero-style emphasis with slightly stronger shadow */
  loud?: boolean;
}

/**
 * SectionCard - Clean card without accent line
 * For secondary content sections
 */
export default function SectionCard({
  title,
  description,
  titleIcon,
  action,
  children,
  className = '',
  noPadding = false,
  loud = false,
}: SectionCardProps) {
  const paddingClass = noPadding ? '' : 'p-4 md:p-5';
  const cardStyle = loud 
    ? 'bg-[var(--surface)] rounded-2xl shadow-md ring-1 ring-[var(--border)]' 
    : 'bg-[var(--surface)] rounded-2xl shadow-sm ring-1 ring-[var(--border)]';
  
  return (
    <div className={`${cardStyle} ${className}`}>
      {(title || action) && (
        <div className={`flex items-center justify-between gap-2 ${noPadding ? 'px-4 md:px-5 pt-4 md:pt-5 pb-3 md:pb-4' : 'pb-3 md:pb-4'}`}>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            {titleIcon && (
              <span className="text-[var(--muted)] flex-shrink-0">
                {titleIcon}
              </span>
            )}
            <div className="min-w-0">
            {title && (
              <h3 className="text-base font-semibold text-[var(--text)] tracking-tight">
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-1 text-sm text-[var(--muted)]">
                {description}
              </p>
            )}
            </div>
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      <div className={paddingClass}>
        {children}
      </div>
    </div>
  );
}
