import React from 'react';

interface SignatureCardProps {
  children: React.ReactNode;
  /** @deprecated Use title with centerTitle instead */
  eyebrow?: string;
  title?: string;
  /** Icon to show next to centered title */
  titleIcon?: React.ReactNode;
  /** Center the title with icon (Reviews-style) */
  centerTitle?: boolean;
  action?: React.ReactNode;
  glass?: boolean;
  hover?: boolean;
  className?: string;
  noPadding?: boolean;
  /** Show red accent line (use sparingly - hero/key cards only) */
  accent?: boolean;
  /** Minimal: no border, lighter shadow - for use inside PageSection with alternating bg */
  minimal?: boolean;
}

/**
 * SignatureCard - Premium card with optional red accent line
 * Use accent=true only on hero cards and key sidebar cards
 */
export default function SignatureCard({
  children,
  eyebrow,
  title,
  titleIcon,
  centerTitle = false,
  action,
  glass = false,
  hover = true,
  className = '',
  noPadding = false,
  accent = true,
  minimal = false,
}: SignatureCardProps) {
  const baseClasses = glass
    ? 'relative bg-white/70 backdrop-blur-xl border border-white/30 rounded-[var(--radius-xl)] overflow-hidden'
    : minimal
      ? 'relative bg-transparent rounded-[var(--radius-xl)] overflow-hidden'
      : 'relative bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-soft)] overflow-hidden transition-all';
  
  const hoverClasses = hover && !minimal
    ? 'hover:shadow-[var(--shadow-pop)] hover:-translate-y-px'
    : '';
  const paddingClasses = noPadding ? '' : 'p-4 md:p-5';
  const showAccent = accent && !minimal;
  // Horizontal padding when accent line is shown (left for line clearance, right so content doesn't reach edge)
  const leftPadding = showAccent ? 'pl-5 md:pl-6' : '';
  const rightPadding = showAccent ? 'pr-5 md:pr-6' : '';

  return (
    <div className={`${baseClasses} ${hoverClasses} ${className}`}>
      {/* Red gradient accent line - only if accent=true and not minimal */}
      {showAccent && (
        <div 
          className="absolute left-0 top-0 bottom-0 w-[2px] rounded-full opacity-90"
          style={{ background: 'linear-gradient(to bottom, #C1121F, #7F0A12)' }}
        />
      )}
      
      <div className={`${paddingClasses} ${leftPadding} ${rightPadding}`}>
        {(centerTitle && title) ? (
          <div className="flex flex-col items-center justify-center mb-4 md:mb-6">
            <div className="flex items-center gap-3">
              {titleIcon && (
                <span className="text-[var(--muted)]">
                  {titleIcon}
                </span>
              )}
              <h2 className="text-2xl font-bold text-[var(--text)]">
                {title}
              </h2>
            </div>
            {action && (
              <div className="mt-2">{action}</div>
            )}
          </div>
        ) : (eyebrow || title || action) && (
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0 flex items-center gap-2">
              {titleIcon && (
                <span className="text-[var(--muted)] flex-shrink-0">
                  {titleIcon}
                </span>
              )}
              <div className="min-w-0">
                {eyebrow && (
                  <span className="eyebrow mb-1 block">{eyebrow}</span>
                )}
                {title && (
                  <h3 className="text-base font-semibold text-[var(--text)] tracking-tight">
                    {title}
                  </h3>
                )}
              </div>
            </div>
            {action && (
              <div className="flex-shrink-0">{action}</div>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
