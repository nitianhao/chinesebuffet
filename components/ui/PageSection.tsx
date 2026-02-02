import { ReactNode } from 'react';

interface PageSectionProps {
  children: ReactNode;
  /** 'base' = warm bg, 'alt' = white - alternates for visual rhythm */
  variant?: 'base' | 'alt';
  className?: string;
}

/**
 * PageSection - Groups content with alternating backgrounds and consistent spacing.
 * Use for major logical blocks. Spacing-first, minimal borders.
 */
export default function PageSection({
  children,
  variant = 'base',
  className = '',
}: PageSectionProps) {
  const bgClass = variant === 'alt' ? 'page-section-bg-alt' : 'page-section-bg-base';
  return (
    <section className={`page-section ${bgClass} ${className}`}>
      {children}
    </section>
  );
}
